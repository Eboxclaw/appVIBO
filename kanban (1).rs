// kanban.rs — Kanban board engine
// Each board = boards/<name>.md (column structure)
// Each card  = tasks/<board>/<card-id>.md (full task note)
// Compatible with Obsidian Kanban plugin format.
// Agents create/move cards via event bus → these commands.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use chrono::Utc;
use uuid::Uuid;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KanbanCard {
    pub id: String,
    pub title: String,
    pub description: String,
    pub column: String,
    pub board: String,
    pub priority: Priority,
    pub due_date: Option<String>,
    pub tags: Vec<String>,
    pub subtasks: Vec<Subtask>,
    pub note_links: Vec<String>,   // [[wikilinks]] to notes
    pub calendar_event_id: Option<String>,
    pub created: String,
    pub modified: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Subtask {
    pub id: String,
    pub title: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    Medium,
    High,
    Urgent,
}

impl Default for Priority {
    fn default() -> Self { Priority::Medium }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KanbanBoard {
    pub name: String,
    pub columns: Vec<String>,
    pub path: String,
    pub card_count: usize,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn boards_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("boards")
}

fn tasks_dir(app: &AppHandle, board: &str) -> PathBuf {
    app.path().app_data_dir().unwrap().join("tasks").join(board)
}

fn card_path(app: &AppHandle, board: &str, card_id: &str) -> PathBuf {
    tasks_dir(app, board).join(format!("{}.md", card_id))
}

fn ensure_dirs(app: &AppHandle, board: &str) -> Result<(), String> {
    std::fs::create_dir_all(boards_dir(app)).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(tasks_dir(app, board)).map_err(|e| e.to_string())
}

fn card_to_md(card: &KanbanCard) -> String {
    let subtask_str: String = card.subtasks.iter().map(|s| {
        format!("- [{}] {}", if s.done { "x" } else { " " }, s.title)
    }).collect::<Vec<_>>().join("\n");

    let links_str = card.note_links.iter()
        .map(|l| format!("[[{}]]", l))
        .collect::<Vec<_>>().join(", ");

    let priority = serde_json::to_string(&card.priority).unwrap_or_default();
    let priority = priority.trim_matches('"');

    format!(
        "---\nid: \"{}\"\ntitle: \"{}\"\nboard: \"{}\"\ncolumn: \"{}\"\npriority: {}\ndue: \"{}\"\ntags: [{}]\ncalendar_event: \"{}\"\ncreated: \"{}\"\nmodified: \"{}\"\n---\n\n{}\n\n{}\n\nLinks: {}\n",
        card.id,
        card.title,
        card.board,
        card.column,
        priority,
        card.due_date.clone().unwrap_or_default(),
        card.tags.join(", "),
        card.calendar_event_id.clone().unwrap_or_default(),
        card.created,
        card.modified,
        card.description,
        subtask_str,
        links_str,
    )
}

fn parse_card(content: &str, path: &PathBuf) -> Result<KanbanCard, String> {
    // Basic YAML frontmatter parse
    let mut id = String::new();
    let mut title = String::new();
    let mut board = String::new();
    let mut column = String::new();
    let mut priority = Priority::Medium;
    let mut due_date = None;
    let mut tags = vec![];
    let mut calendar_event_id = None;
    let mut created = String::new();
    let mut modified = String::new();
    let mut description = String::new();
    let mut subtasks = vec![];
    let mut note_links = vec![];
    let mut in_front = false;
    let mut in_body = false;

    for line in content.lines() {
        if line == "---" {
            if !in_front { in_front = true; continue; }
            else { in_front = false; in_body = true; continue; }
        }
        if in_front {
            if let Some((k, v)) = line.split_once(':') {
                let k = k.trim();
                let v = v.trim().trim_matches('"');
                match k {
                    "id" => id = v.to_string(),
                    "title" => title = v.to_string(),
                    "board" => board = v.to_string(),
                    "column" => column = v.to_string(),
                    "priority" => priority = match v {
                        "high" => Priority::High,
                        "urgent" => Priority::Urgent,
                        "low" => Priority::Low,
                        _ => Priority::Medium,
                    },
                    "due" => if !v.is_empty() { due_date = Some(v.to_string()); },
                    "tags" => tags = v.trim_matches(|c| c == '[' || c == ']')
                        .split(',').map(|t| t.trim().to_string())
                        .filter(|t| !t.is_empty()).collect(),
                    "calendar_event" => if !v.is_empty() { calendar_event_id = Some(v.to_string()); },
                    "created" => created = v.to_string(),
                    "modified" => modified = v.to_string(),
                    _ => {}
                }
            }
        } else if in_body {
            if line.starts_with("- [") {
                let done = line.starts_with("- [x]");
                let task_title = line[5..].trim().to_string();
                subtasks.push(Subtask {
                    id: Uuid::new_v4().to_string(),
                    title: task_title,
                    done,
                });
            } else if line.starts_with("Links:") {
                let links_part = &line[6..];
                for part in links_part.split(',') {
                    let link = part.trim().trim_start_matches("[[").trim_end_matches("]]");
                    if !link.is_empty() {
                        note_links.push(link.to_string());
                    }
                }
            } else {
                description.push_str(line);
                description.push('\n');
            }
        }
    }

    Ok(KanbanCard {
        id, title, description: description.trim().to_string(),
        column, board, priority, due_date, tags, subtasks,
        note_links, calendar_event_id, created, modified,
        path: path.to_string_lossy().to_string(),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn kanban_board_create(
    app: AppHandle,
    name: String,
    columns: Option<Vec<String>>,
) -> Result<KanbanBoard, String> {
    let cols = columns.unwrap_or_else(|| vec![
        "Backlog".to_string(),
        "In Progress".to_string(),
        "Review".to_string(),
        "Done".to_string(),
    ]);
    ensure_dirs(&app, &name)?;
    let board_path = boards_dir(&app).join(format!("{}.md", name));
    // Obsidian Kanban plugin compatible format
    let content = format!(
        "---\nkanban-plugin: basic\n---\n\n{}\n",
        cols.iter().map(|c| format!("## {}\n\n", c)).collect::<String>()
    );
    std::fs::write(&board_path, content).map_err(|e| e.to_string())?;
    Ok(KanbanBoard {
        name: name.clone(),
        columns: cols,
        path: board_path.to_string_lossy().to_string(),
        card_count: 0,
    })
}

#[tauri::command]
pub async fn kanban_board_list(app: AppHandle) -> Result<Vec<KanbanBoard>, String> {
    let dir = boards_dir(&app);
    if !dir.exists() { return Ok(vec![]); }
    let mut boards = vec![];
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let name = path.file_stem().unwrap().to_string_lossy().to_string();
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let columns = content.lines()
                .filter(|l| l.starts_with("## "))
                .map(|l| l[3..].trim().to_string())
                .collect();
            let card_count = std::fs::read_dir(tasks_dir(&app, &name))
                .map(|d| d.count()).unwrap_or(0);
            boards.push(KanbanBoard {
                name,
                columns,
                path: path.to_string_lossy().to_string(),
                card_count,
            });
        }
    }
    Ok(boards)
}

#[tauri::command]
pub async fn kanban_board_get(app: AppHandle, name: String) -> Result<Vec<KanbanCard>, String> {
    let dir = tasks_dir(&app, &name);
    if !dir.exists() { return Ok(vec![]); }
    let mut cards = vec![];
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            if let Ok(card) = parse_card(&content, &path) {
                cards.push(card);
            }
        }
    }
    cards.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(cards)
}

#[tauri::command]
pub async fn kanban_board_delete(app: AppHandle, name: String) -> Result<(), String> {
    let board_path = boards_dir(&app).join(format!("{}.md", name));
    if board_path.exists() {
        std::fs::remove_file(board_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn kanban_card_create(
    app: AppHandle,
    board: String,
    title: String,
    column: String,
    description: Option<String>,
    priority: Option<Priority>,
    due_date: Option<String>,
    tags: Option<Vec<String>>,
    note_links: Option<Vec<String>>,
) -> Result<KanbanCard, String> {
    ensure_dirs(&app, &board)?;
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let card = KanbanCard {
        id: id.clone(),
        title,
        description: description.unwrap_or_default(),
        column,
        board: board.clone(),
        priority: priority.unwrap_or_default(),
        due_date,
        tags: tags.unwrap_or_default(),
        subtasks: vec![],
        note_links: note_links.unwrap_or_default(),
        calendar_event_id: None,
        created: now.clone(),
        modified: now,
        path: card_path(&app, &board, &id).to_string_lossy().to_string(),
    };
    let content = card_to_md(&card);
    std::fs::write(card_path(&app, &board, &id), content).map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
pub async fn kanban_card_read(
    app: AppHandle,
    board: String,
    card_id: String,
) -> Result<KanbanCard, String> {
    let path = card_path(&app, &board, &card_id);
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    parse_card(&content, &path)
}

#[tauri::command]
pub async fn kanban_card_update(
    app: AppHandle,
    board: String,
    card_id: String,
    title: Option<String>,
    description: Option<String>,
    priority: Option<Priority>,
    due_date: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<KanbanCard, String> {
    let path = card_path(&app, &board, &card_id);
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut card = parse_card(&content, &path)?;
    if let Some(t) = title { card.title = t; }
    if let Some(d) = description { card.description = d; }
    if let Some(p) = priority { card.priority = p; }
    if due_date.is_some() { card.due_date = due_date; }
    if let Some(t) = tags { card.tags = t; }
    card.modified = Utc::now().to_rfc3339();
    let updated = card_to_md(&card);
    std::fs::write(&path, updated).map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
pub async fn kanban_card_delete(
    app: AppHandle,
    board: String,
    card_id: String,
) -> Result<(), String> {
    let path = card_path(&app, &board, &card_id);
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kanban_card_move(
    app: AppHandle,
    board: String,
    card_id: String,
    new_column: String,
) -> Result<KanbanCard, String> {
    kanban_card_update(app, board, card_id, None, None, None, None, None).await
        .map(|mut c| { c.column = new_column; c })
}

#[tauri::command]
pub async fn kanban_card_add_subtask(
    app: AppHandle,
    board: String,
    card_id: String,
    subtask_title: String,
) -> Result<KanbanCard, String> {
    let path = card_path(&app, &board, &card_id);
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut card = parse_card(&content, &path)?;
    card.subtasks.push(Subtask {
        id: Uuid::new_v4().to_string(),
        title: subtask_title,
        done: false,
    });
    card.modified = Utc::now().to_rfc3339();
    std::fs::write(&path, card_to_md(&card)).map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
pub async fn kanban_card_complete_subtask(
    app: AppHandle,
    board: String,
    card_id: String,
    subtask_id: String,
) -> Result<KanbanCard, String> {
    let path = card_path(&app, &board, &card_id);
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut card = parse_card(&content, &path)?;
    for sub in card.subtasks.iter_mut() {
        if sub.id == subtask_id { sub.done = true; }
    }
    card.modified = Utc::now().to_rfc3339();
    std::fs::write(&path, card_to_md(&card)).map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
pub async fn kanban_get_due(
    app: AppHandle,
    board: String,
    date: String,
) -> Result<Vec<KanbanCard>, String> {
    let cards = kanban_board_get(app, board).await?;
    Ok(cards.into_iter()
        .filter(|c| c.due_date.as_deref() == Some(&date))
        .collect())
}

#[tauri::command]
pub async fn kanban_get_overdue(app: AppHandle, board: String) -> Result<Vec<KanbanCard>, String> {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let cards = kanban_board_get(app, board).await?;
    Ok(cards.into_iter()
        .filter(|c| {
            c.due_date.as_ref()
                .map(|d| d.as_str() < today.as_str())
                .unwrap_or(false)
                && c.column != "Done"
        })
        .collect())
}

#[tauri::command]
pub async fn kanban_create_from_calendar(
    app: AppHandle,
    board: String,
    event_title: String,
    event_date: String,
    event_id: String,
    column: Option<String>,
) -> Result<KanbanCard, String> {
    let path = card_path(&app, &board, &Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let card = KanbanCard {
        id: id.clone(),
        title: event_title,
        description: format!("Created from calendar event {}", event_id),
        column: column.unwrap_or("Backlog".to_string()),
        board: board.clone(),
        priority: Priority::Medium,
        due_date: Some(event_date),
        tags: vec!["calendar".to_string()],
        subtasks: vec![],
        note_links: vec![],
        calendar_event_id: Some(event_id),
        created: now.clone(),
        modified: now,
        path: path.to_string_lossy().to_string(),
    };
    ensure_dirs(&app, &board)?;
    std::fs::write(&path, card_to_md(&card)).map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
pub async fn kanban_get_by_event(
    app: AppHandle,
    board: String,
    event_id: String,
) -> Result<Option<KanbanCard>, String> {
    let cards = kanban_board_get(app, board).await?;
    Ok(cards.into_iter().find(|c| c.calendar_event_id.as_deref() == Some(&event_id)))
}

#[tauri::command]
pub async fn kanban_export_board(
    app: AppHandle,
    board: String,
) -> Result<String, String> {
    let cards = kanban_board_get(app.clone(), board.clone()).await?;
    let boards = kanban_board_list(app).await?;
    let board_info = boards.into_iter().find(|b| b.name == board)
        .ok_or("Board not found")?;
    let mut md = format!("# {}\n\n", board);
    for col in &board_info.columns {
        md.push_str(&format!("## {}\n\n", col));
        for card in cards.iter().filter(|c| &c.column == col) {
            md.push_str(&format!("- [ ] {}\n", card.title));
        }
        md.push('\n');
    }
    Ok(md)
}
