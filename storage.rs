// storage.rs — SQLite persistence layer
// Handles: note index, kanban index, SRI routing signals,
//          semantic cache, agent memory, distillations.
// Vectors live in tauri-plugin-velesdb — NOT here.
// Agent memory routes through here (not Koog's own SQLite)
// so it feeds SRI distillation pipeline.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_sql::{DbPool, Migration, MigrationKind};

// ── State ─────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct StorageState {
    pub initialized: Mutex<bool>,
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SriDecision {
    pub action: String,
    pub tool: Option<String>,
    pub confidence: f32,
    pub can_parallelize: bool,
    pub escalate_cloud: bool,
    pub matched_notes: Vec<String>,
    pub cached_response: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentMemoryEntry {
    pub session: String,
    pub key: String,
    pub value: String,
    pub created: String,
    pub updated: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Distillation {
    pub id: String,
    pub distillation_type: String, // "tag_cluster" | "temporal" | "semantic"
    pub content_md: String,
    pub source_ids: Vec<String>,
    pub created: String,
}

// ── DB Init ───────────────────────────────────────────────────────────────────

pub async fn init_db(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let db = app.state::<DbPool>();

    // notes_index — fast listing without reading .md files
    db.execute(
        "CREATE TABLE IF NOT EXISTS notes_index (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            path TEXT NOT NULL,
            tags TEXT DEFAULT '[]',
            word_count INTEGER DEFAULT 0,
            modified TEXT NOT NULL,
            created TEXT NOT NULL
        )", []
    ).await?;

    // kanban_index — fast board queries
    db.execute(
        "CREATE TABLE IF NOT EXISTS kanban_index (
            id TEXT PRIMARY KEY,
            board TEXT NOT NULL,
            column_name TEXT NOT NULL,
            title TEXT NOT NULL,
            priority TEXT DEFAULT 'medium',
            due_date TEXT,
            modified TEXT NOT NULL
        )", []
    ).await?;

    // routing_signals — regex/keyword rules for SRI step 1
    db.execute(
        "CREATE TABLE IF NOT EXISTS routing_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern TEXT NOT NULL,
            signal_type TEXT NOT NULL, -- 'keyword' | 'regex' | 'domain'
            action TEXT NOT NULL,
            tool TEXT,
            confidence REAL DEFAULT 0.9,
            priority INTEGER DEFAULT 0
        )", []
    ).await?;

    // semantic_cache — SRI step 2: avoid re-running LLM for similar queries
    db.execute(
        "CREATE TABLE IF NOT EXISTS semantic_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_hash TEXT UNIQUE NOT NULL,
            query_text TEXT NOT NULL,
            result_json TEXT NOT NULL,
            hit_count INTEGER DEFAULT 1,
            created TEXT NOT NULL,
            last_hit TEXT NOT NULL
        )", []
    ).await?;

    // agent_memory — Koog memory routed through Rust (feeds distillations)
    db.execute(
        "CREATE TABLE IF NOT EXISTS agent_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            created TEXT NOT NULL,
            updated TEXT NOT NULL,
            UNIQUE(session, key)
        )", []
    ).await?;

    // distillations — compact knowledge from SQL → used to build MD distillations
    db.execute(
        "CREATE TABLE IF NOT EXISTS distillations (
            id TEXT PRIMARY KEY,
            distillation_type TEXT NOT NULL,
            content_md TEXT NOT NULL,
            source_ids TEXT DEFAULT '[]',
            created TEXT NOT NULL
        )", []
    ).await?;

    // Seed routing signals
    seed_routing_signals(&db).await?;

    Ok(())
}

async fn seed_routing_signals(db: &DbPool) -> Result<(), Box<dyn std::error::Error>> {
    let count: i64 = db.select_one("SELECT COUNT(*) FROM routing_signals", []).await?;
    if count > 0 { return Ok(()); }

    let signals = vec![
        ("calendar|event|meeting|schedule|appointment", "keyword", "google_calendar", Some("google_calendar_read"), 0.9),
        ("create task|add task|new task|todo", "keyword", "kanban_create", Some("kanban_card_create"), 0.9),
        ("move card|update task|close task|done", "keyword", "kanban_move", Some("kanban_card_move"), 0.85),
        ("encrypt|lock|private|secret|vault", "keyword", "vault_op", None, 0.85),
        ("search|find|look for|notes about", "keyword", "note_search", Some("note_search"), 0.8),
        ("daily note|today's note", "keyword", "daily_note", Some("note_daily_get"), 0.95),
        ("cloud|api|anthropic|openrouter|upgrade", "keyword", "escalate_cloud", None, 0.7),
    ];

    for (pattern, signal_type, action, tool, confidence) in signals {
        let tool_val = tool.unwrap_or("");
        db.execute(
            "INSERT OR IGNORE INTO routing_signals (pattern, signal_type, action, tool, confidence)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            (pattern, signal_type, action, tool_val, confidence)
        ).await?;
    }
    Ok(())
}

// ── Storage Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn storage_init(app: AppHandle) -> Result<(), String> {
    init_db(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn storage_note_index(
    app: AppHandle,
    id: String,
    title: String,
    path: String,
    tags: Vec<String>,
    word_count: u32,
    modified: String,
    created: String,
) -> Result<(), String> {
    let db = app.state::<DbPool>();
    db.execute(
        "INSERT OR REPLACE INTO notes_index (id, title, path, tags, word_count, modified, created)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (id, title, path, serde_json::to_string(&tags).unwrap(), word_count, modified, created)
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn storage_note_remove(app: AppHandle, id: String) -> Result<(), String> {
    let db = app.state::<DbPool>();
    db.execute("DELETE FROM notes_index WHERE id = ?1", [id])
        .await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn storage_search_fulltext(
    app: AppHandle,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = app.state::<DbPool>();
    let lim = limit.unwrap_or(20);
    let pattern = format!("%{}%", query.to_lowercase());
    let results = db.select(
        "SELECT id, title, tags, modified FROM notes_index
         WHERE LOWER(title) LIKE ?1 ORDER BY modified DESC LIMIT ?2",
        (pattern, lim)
    ).await.map_err(|e| e.to_string())?;
    Ok(results)
}

// ── SRI Commands ──────────────────────────────────────────────────────────────

fn compute_query_hash(query: &str) -> String {
    use sha2::{Sha256, Digest};
    let hash = Sha256::digest(query.to_lowercase().trim().as_bytes());
    format!("{:x}", hash)[..16].to_string()
}

/// Main SRI routing entry point.
/// Step 1: regex/keyword match (~1ms)
/// Step 2: semantic cache lookup (~5ms)
/// Step 3: velesdb vector search (~70µs) — called from sri.rs
#[tauri::command]
pub async fn storage_sri_route(
    app: AppHandle,
    prompt: String,
) -> Result<SriDecision, String> {
    let db = app.state::<DbPool>();
    let prompt_lower = prompt.to_lowercase();

    // Step 1: keyword/regex routing signals
    let signals: Vec<(String, String, Option<String>, f32)> = db.select(
        "SELECT pattern, action, tool, confidence FROM routing_signals ORDER BY priority DESC, confidence DESC",
        []
    ).await.map_err(|e| e.to_string())?;

    for (pattern, action, tool, confidence) in &signals {
        let patterns: Vec<&str> = pattern.split('|').collect();
        if patterns.iter().any(|p| prompt_lower.contains(p.trim())) {
            // Step 2: check cache
            let hash = compute_query_hash(&prompt);
            if let Ok(cached) = db.select_one::<Option<String>>(
                "SELECT result_json FROM semantic_cache WHERE query_hash = ?1", [&hash]
            ).await {
                if let Some(result) = cached {
                    db.execute(
                        "UPDATE semantic_cache SET hit_count = hit_count + 1, last_hit = ?1 WHERE query_hash = ?2",
                        (chrono::Utc::now().to_rfc3339(), hash)
                    ).await.ok();
                    if let Ok(decision) = serde_json::from_str(&result) {
                        return Ok(decision);
                    }
                }
            }
            return Ok(SriDecision {
                action: action.clone(),
                tool: tool.clone(),
                confidence: *confidence,
                can_parallelize: false,
                escalate_cloud: *confidence < 0.7,
                matched_notes: vec![],
                cached_response: None,
            });
        }
    }

    // No keyword match — fallback to full agent reasoning
    Ok(SriDecision {
        action: "agent_reason".to_string(),
        tool: None,
        confidence: 0.5,
        can_parallelize: false,
        escalate_cloud: false,
        matched_notes: vec![],
        cached_response: None,
    })
}

#[tauri::command]
pub async fn storage_cache_get(
    app: AppHandle,
    query: String,
) -> Result<Option<String>, String> {
    let db = app.state::<DbPool>();
    let hash = compute_query_hash(&query);
    db.select_one(
        "SELECT result_json FROM semantic_cache WHERE query_hash = ?1",
        [hash]
    ).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn storage_cache_set(
    app: AppHandle,
    query: String,
    result: String,
) -> Result<(), String> {
    let db = app.state::<DbPool>();
    let hash = compute_query_hash(&query);
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT OR REPLACE INTO semantic_cache (query_hash, query_text, result_json, created, last_hit)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        (hash, query, result, now)
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── Agent Memory Commands ─────────────────────────────────────────────────────
// All Koog memory routes through here — never Koog's own SQLite.
// This allows distillation pipeline to learn from agent behavior.

#[tauri::command]
pub async fn storage_agent_memory_get(
    app: AppHandle,
    session: String,
    key: String,
) -> Result<Option<String>, String> {
    let db = app.state::<DbPool>();
    db.select_one(
        "SELECT value FROM agent_memory WHERE session = ?1 AND key = ?2",
        (session, key)
    ).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn storage_agent_memory_set(
    app: AppHandle,
    session: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = app.state::<DbPool>();
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT OR REPLACE INTO agent_memory (session, key, value, created, updated)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(session, key) DO UPDATE SET value = ?3, updated = ?4",
        (session, key, value, now)
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn storage_agent_memory_delete(
    app: AppHandle,
    session: String,
    key: String,
) -> Result<(), String> {
    let db = app.state::<DbPool>();
    db.execute(
        "DELETE FROM agent_memory WHERE session = ?1 AND key = ?2",
        (session, key)
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── Distillation Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn storage_distillation_save(
    app: AppHandle,
    id: String,
    distillation_type: String,
    content_md: String,
    source_ids: Vec<String>,
) -> Result<(), String> {
    let db = app.state::<DbPool>();
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT OR REPLACE INTO distillations (id, distillation_type, content_md, source_ids, created)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (id, distillation_type, content_md, serde_json::to_string(&source_ids).unwrap(), now)
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn storage_distillation_list(
    app: AppHandle,
    distillation_type: Option<String>,
) -> Result<Vec<Distillation>, String> {
    let db = app.state::<DbPool>();
    let rows: Vec<(String, String, String, String, String)> = match distillation_type {
        Some(t) => db.select(
            "SELECT id, distillation_type, content_md, source_ids, created
             FROM distillations WHERE distillation_type = ?1 ORDER BY created DESC",
            [t]
        ).await.map_err(|e| e.to_string())?,
        None => db.select(
            "SELECT id, distillation_type, content_md, source_ids, created
             FROM distillations ORDER BY created DESC LIMIT 100",
            []
        ).await.map_err(|e| e.to_string())?,
    };
    Ok(rows.into_iter().map(|(id, dt, content_md, source_ids_json, created)| {
        let source_ids = serde_json::from_str(&source_ids_json).unwrap_or_default();
        Distillation { id, distillation_type: dt, content_md, source_ids, created }
    }).collect())
}
