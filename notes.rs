// notes.rs — Obsidian-compatible note engine
// All notes are plain .md files on disk.
// Vault path: $APPDATA/ViBo/notes/
// Encrypted notes are handled by vault.rs — never here.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use chrono::Utc;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub path: String,
    pub content: String,
    pub frontmatter: HashMap<String, serde_json::Value>,
    pub tags: Vec<String>,
    pub links: Vec<String>,       // outgoing [[wikilinks]]
    pub backlinks: Vec<String>,   // computed — incoming
    pub created: String,
    pub modified: String,
    pub word_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NoteStub {
    pub id: String,
    pub title: String,
    pub path: String,
    pub tags: Vec<String>,
    pub modified: String,
    pub word_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub stub: NoteStub,
    pub excerpt: String,
    pub score: f32,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn vault_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir()
        .expect("no app data dir")
        .join("notes")
}

fn note_path(app: &AppHandle, filename: &str) -> PathBuf {
    vault_dir(app).join(filename)
}

fn ensure_vault(app: &AppHandle) -> Result<(), String> {
    std::fs::create_dir_all(vault_dir(app))
        .map_err(|e| e.to_string())
}

/// Extract YAML frontmatter between --- delimiters
fn parse_frontmatter(content: &str) -> (HashMap<String, serde_json::Value>, String) {
    if !content.starts_with("---") {
        return (HashMap::new(), content.to_string());
    }
    let rest = &content[3..];
    if let Some(end) = rest.find("\n---") {
        let yaml = &rest[..end];
        let body = &rest[end + 4..];
        let mut map = HashMap::new();
        for line in yaml.lines() {
            if let Some((k, v)) = line.split_once(':') {
                let key = k.trim().to_string();
                let val = v.trim().trim_matches('"');
                map.insert(key, serde_json::Value::String(val.to_string()));
            }
        }
        (map, body.trim_start().to_string())
    } else {
        (HashMap::new(), content.to_string())
    }
}

fn extract_tags(frontmatter: &HashMap<String, serde_json::Value>, body: &str) -> Vec<String> {
    let mut tags = vec![];
    // From frontmatter tags: [tag1, tag2]
    if let Some(serde_json::Value::String(t)) = frontmatter.get("tags") {
        for tag in t.split(',') {
            tags.push(tag.trim().to_string());
        }
    }
    // Inline #hashtags
    for word in body.split_whitespace() {
        if word.starts_with('#') && word.len() > 1 {
            tags.push(word[1..].to_string());
        }
    }
    tags.dedup();
    tags
}

fn extract_wikilinks(content: &str) -> Vec<String> {
    let mut links = vec![];
    let mut rest = content;
    while let Some(start) = rest.find("[[") {
        rest = &rest[start + 2..];
        if let Some(end) = rest.find("]]") {
            let link = &rest[..end];
            // Handle [[Note|alias]] format
            let target = link.split('|').next().unwrap_or(link).trim();
            links.push(target.to_string());
            rest = &rest[end + 2..];
        }
    }
    links.dedup();
    links
}

fn filename_to_id(filename: &str) -> String {
    filename.trim_end_matches(".md").to_string()
}

fn title_to_filename(title: &str) -> String {
    let safe: String = title.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '-' })
        .collect();
    format!("{}.md", safe.trim().replace(' ', "-"))
}

fn read_note_from_path(app: &AppHandle, path: &PathBuf) -> Result<Note, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let filename = path.file_name().unwrap().to_string_lossy().to_string();
    let (frontmatter, body) = parse_frontmatter(&content);
    let tags = extract_tags(&frontmatter, &body);
    let links = extract_wikilinks(&content);
    let title = frontmatter.get("title")
        .and_then(|v| v.as_str())
        .unwrap_or(&filename.trim_end_matches(".md").replace('-', " "))
        .to_string();
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta.modified().ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
            .unwrap_or_default().to_rfc3339())
        .unwrap_or_default();
    let created = frontmatter.get("created")
        .and_then(|v| v.as_str())
        .unwrap_or(&modified)
        .to_string();
    let word_count = body.split_whitespace().count() as u32;
    Ok(Note {
        id: filename_to_id(&filename),
        title,
        path: path.to_string_lossy().to_string(),
        content: body,
        frontmatter,
        tags,
        links,
        backlinks: vec![], // computed separately
        created,
        modified,
        word_count,
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn note_create(
    app: AppHandle,
    title: String,
    content: Option<String>,
    tags: Option<Vec<String>>,
    folder: Option<String>,
) -> Result<Note, String> {
    ensure_vault(&app)?;
    let filename = title_to_filename(&title);
    let dir = match &folder {
        Some(f) => vault_dir(&app).join(f),
        None => vault_dir(&app),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    if path.exists() {
        return Err(format!("Note '{}' already exists", filename));
    }
    let now = Utc::now().to_rfc3339();
    let tag_str = tags.as_ref()
        .map(|t| t.join(", "))
        .unwrap_or_default();
    let body = content.unwrap_or_default();
    let full = format!(
        "---\ntitle: \"{}\"\ncreated: \"{}\"\nmodified: \"{}\"\ntags: [{}]\n---\n\n{}",
        title, now, now, tag_str, body
    );
    std::fs::write(&path, &full).map_err(|e| e.to_string())?;
    read_note_from_path(&app, &path)
}

#[tauri::command]
pub async fn note_read(app: AppHandle, filename: String) -> Result<Note, String> {
    let path = note_path(&app, &filename);
    if !path.exists() {
        return Err(format!("Note '{}' not found", filename));
    }
    read_note_from_path(&app, &path)
}

#[tauri::command]
pub async fn note_write(
    app: AppHandle,
    filename: String,
    content: String,
) -> Result<Note, String> {
    let path = note_path(&app, &filename);
    if !path.exists() {
        return Err(format!("Note '{}' not found", filename));
    }
    let existing = read_note_from_path(&app, &path)?;
    let now = Utc::now().to_rfc3339();
    let mut fm = existing.frontmatter.clone();
    fm.insert("modified".to_string(), serde_json::Value::String(now.clone()));
    let tag_str = existing.tags.join(", ");
    let title = fm.get("title").and_then(|v| v.as_str()).unwrap_or(&filename).to_string();
    let created = fm.get("created").and_then(|v| v.as_str()).unwrap_or(&now).to_string();
    let full = format!(
        "---\ntitle: \"{}\"\ncreated: \"{}\"\nmodified: \"{}\"\ntags: [{}]\n---\n\n{}",
        title, created, now, tag_str, content
    );
    std::fs::write(&path, &full).map_err(|e| e.to_string())?;
    read_note_from_path(&app, &path)
}

#[tauri::command]
pub async fn note_patch(
    app: AppHandle,
    filename: String,
    append: String,
) -> Result<Note, String> {
    let note = note_read(app.clone(), filename.clone()).await?;
    let new_content = format!("{}\n{}", note.content, append);
    note_write(app, filename, new_content).await
}

#[tauri::command]
pub async fn note_delete(app: AppHandle, filename: String) -> Result<(), String> {
    let path = note_path(&app, &filename);
    if !path.exists() {
        return Err(format!("Note '{}' not found", filename));
    }
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_move(
    app: AppHandle,
    filename: String,
    new_folder: String,
) -> Result<Note, String> {
    let old_path = note_path(&app, &filename);
    let new_dir = vault_dir(&app).join(&new_folder);
    std::fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;
    let new_path = new_dir.join(&filename);
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    // TODO: update all [[wikilinks]] referencing this note in other files
    read_note_from_path(&app, &new_path)
}

#[tauri::command]
pub async fn note_rename(
    app: AppHandle,
    filename: String,
    new_title: String,
) -> Result<Note, String> {
    let old_path = note_path(&app, &filename);
    let new_filename = title_to_filename(&new_title);
    let new_path = old_path.parent().unwrap().join(&new_filename);
    // Update frontmatter title
    let content = std::fs::read_to_string(&old_path).map_err(|e| e.to_string())?;
    let updated = content.replacen(
        &format!("title: \"{}\"", filename_to_id(&filename).replace('-', " ")),
        &format!("title: \"{}\"", new_title),
        1,
    );
    std::fs::write(&old_path, &updated).map_err(|e| e.to_string())?;
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    // TODO: update all [[wikilinks]] referencing old filename
    read_note_from_path(&app, &new_path)
}

#[tauri::command]
pub async fn note_list(app: AppHandle, folder: Option<String>) -> Result<Vec<NoteStub>, String> {
    let dir = match folder {
        Some(f) => vault_dir(&app).join(f),
        None => vault_dir(&app),
    };
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut stubs = vec![];
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Ok(note) = read_note_from_path(&app, &path) {
                stubs.push(NoteStub {
                    id: note.id,
                    title: note.title,
                    path: note.path,
                    tags: note.tags,
                    modified: note.modified,
                    word_count: note.word_count,
                });
            }
        }
    }
    stubs.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(stubs)
}

#[tauri::command]
pub async fn note_list_folder(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = vault_dir(&app);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut folders = vec![];
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_dir() {
            folders.push(entry.file_name().to_string_lossy().to_string());
        }
    }
    Ok(folders)
}

#[tauri::command]
pub async fn note_search(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let stubs = note_list(app.clone(), None).await?;
    let q = query.to_lowercase();
    let limit = limit.unwrap_or(20);
    let mut results = vec![];
    for stub in stubs {
        let note = note_read(app.clone(), format!("{}.md", stub.id)).await?;
        let body_lower = note.content.to_lowercase();
        let title_lower = note.title.to_lowercase();
        let score = if title_lower.contains(&q) { 2.0 }
                    else if body_lower.contains(&q) { 1.0 }
                    else { continue };
        let pos = body_lower.find(&q).unwrap_or(0);
        let start = pos.saturating_sub(60);
        let end = (pos + q.len() + 60).min(note.content.len());
        let excerpt = format!("...{}...", &note.content[start..end]);
        results.push(SearchResult { stub, excerpt, score });
        if results.len() >= limit { break; }
    }
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
    Ok(results)
}

#[tauri::command]
pub async fn note_search_tags(
    app: AppHandle,
    tags: Vec<String>,
) -> Result<Vec<NoteStub>, String> {
    let stubs = note_list(app.clone(), None).await?;
    let results = stubs.into_iter()
        .filter(|s| tags.iter().any(|t| s.tags.contains(t)))
        .collect();
    Ok(results)
}

#[tauri::command]
pub async fn note_get_frontmatter(
    app: AppHandle,
    filename: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    let note = note_read(app, filename).await?;
    Ok(note.frontmatter)
}

#[tauri::command]
pub async fn note_set_frontmatter(
    app: AppHandle,
    filename: String,
    key: String,
    value: serde_json::Value,
) -> Result<Note, String> {
    let path = note_path(&app, &filename);
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let val_str = match &value {
        serde_json::Value::String(s) => format!("\"{}\"", s),
        other => other.to_string(),
    };
    // Simple replace — works for existing keys
    if content.contains(&format!("{}:", key)) {
        let lines: Vec<String> = content.lines().map(|l| {
            if l.trim_start().starts_with(&format!("{}:", key)) {
                format!("{}: {}", key, val_str)
            } else {
                l.to_string()
            }
        }).collect();
        std::fs::write(&path, lines.join("\n")).map_err(|e| e.to_string())?;
    }
    // TODO: handle inserting new key
    read_note_from_path(&app, &path)
}

#[tauri::command]
pub async fn note_get_links(app: AppHandle, filename: String) -> Result<Vec<String>, String> {
    let note = note_read(app, filename).await?;
    Ok(note.links)
}

#[tauri::command]
pub async fn note_get_backlinks(
    app: AppHandle,
    filename: String,
) -> Result<Vec<NoteStub>, String> {
    let target_id = filename_to_id(&filename);
    let all = note_list(app.clone(), None).await?;
    let mut backlinks = vec![];
    for stub in all {
        let note = note_read(app.clone(), format!("{}.md", stub.id)).await?;
        if note.links.iter().any(|l| l == &target_id) {
            backlinks.push(stub);
        }
    }
    Ok(backlinks)
}

#[tauri::command]
pub async fn note_get_orphans(app: AppHandle) -> Result<Vec<NoteStub>, String> {
    let all = note_list(app.clone(), None).await?;
    let mut orphans = vec![];
    for stub in &all {
        let note = note_read(app.clone(), format!("{}.md", stub.id)).await?;
        let has_backlinks = all.iter().any(|s| {
            // crude check — full pass
            s.id != stub.id
        });
        if note.links.is_empty() && !has_backlinks {
            orphans.push(stub.clone());
        }
    }
    Ok(orphans)
}

#[tauri::command]
pub async fn note_daily_get(app: AppHandle) -> Result<Option<Note>, String> {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let filename = format!("{}.md", today);
    let path = vault_dir(&app).join("daily").join(&filename);
    if path.exists() {
        Ok(Some(read_note_from_path(&app, &path)?))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn note_daily_create(app: AppHandle) -> Result<Note, String> {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let title = format!("Daily {}", today);
    note_create(app, title, None, Some(vec!["daily".to_string()]), Some("daily".to_string())).await
}

#[tauri::command]
pub async fn note_snapshot(app: AppHandle, filename: String) -> Result<String, String> {
    let path = note_path(&app, &filename);
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let now = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let snap_dir = vault_dir(&app).join(".snapshots");
    std::fs::create_dir_all(&snap_dir).map_err(|e| e.to_string())?;
    let snap_name = format!("{}-{}", filename, now);
    let snap_path = snap_dir.join(&snap_name);
    std::fs::write(&snap_path, content).map_err(|e| e.to_string())?;
    Ok(snap_name)
}

#[tauri::command]
pub async fn note_restore(
    app: AppHandle,
    filename: String,
    snapshot_name: String,
) -> Result<Note, String> {
    let snap_dir = vault_dir(&app).join(".snapshots");
    let snap_path = snap_dir.join(&snapshot_name);
    let content = std::fs::read_to_string(&snap_path).map_err(|e| e.to_string())?;
    let path = note_path(&app, &filename);
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    read_note_from_path(&app, &path)
}

#[derive(Serialize)]
pub struct VaultStats {
    pub total_notes: usize,
    pub total_words: u32,
    pub total_tags: usize,
    pub total_links: usize,
}

#[tauri::command]
pub async fn note_stats(app: AppHandle) -> Result<VaultStats, String> {
    let stubs = note_list(app.clone(), None).await?;
    let total_notes = stubs.len();
    let total_words = stubs.iter().map(|s| s.word_count).sum();
    let total_tags = stubs.iter().flat_map(|s| s.tags.iter()).count();
    // links would require reading each note — approximate here
    Ok(VaultStats { total_notes, total_words, total_tags, total_links: 0 })
}
