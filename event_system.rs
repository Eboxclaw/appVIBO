// event_system.rs — Event bus + Kotlin↔Rust bridge
// Koog tools trigger events here — Rust handles them securely.
// All Kotlin→Rust communication uses trigger/listen pattern.
// Events also fire automatically from note/kanban mutations.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Listener, Manager};

// ── State ─────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct EventSystem {
    pub active_tasks: Mutex<Vec<String>>,
}

// ── Event types ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "payload")]
pub enum AppEvent {
    NoteCreated { id: String },
    NoteEdited   { id: String },
    NoteDeleted  { id: String },
    KanbanMoved  { board: String, card_id: String, column: String },
    UserPrompt   { prompt: String, session: String },
    SearchQuery  { query: String },
    DailyMaintenance,
    SyncRequested { provider: String },
    AgentStarted  { agent: String, task: String },
    AgentDone     { agent: String, result: String },
    AgentFailed   { agent: String, error: String },
}

// ── Koog tool call payload ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolRequest {
    pub request_id: String,
    pub tool: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolResponse {
    pub request_id: String,
    pub result: serde_json::Value,
    pub error: Option<String>,
}

// ── Listener registration ─────────────────────────────────────────────────────
// Called once at app startup from main.rs setup()

pub fn register_listeners(app: &AppHandle) {
    let handle = app.clone();

    // Koog emits "tool-request" → Rust dispatches to the right module
    app.listen("tool-request", move |event| {
        if let Ok(req) = serde_json::from_str::<ToolRequest>(event.payload()) {
            let h = handle.clone();
            tauri::async_runtime::spawn(async move {
                let response = dispatch_tool_call(&h, req.clone()).await;
                let payload = ToolResponse {
                    request_id: req.request_id,
                    result: response.0,
                    error: response.1,
                };
                h.emit("tool-result", payload).ok();
            });
        }
    });

    // Auto-embed on note creation
    let handle2 = app.clone();
    app.listen("note-created", move |event| {
        let h = handle2.clone();
        if let Ok(event) = serde_json::from_str::<AppEvent>(event.payload()) {
            if let AppEvent::NoteCreated { id } = event {
                tauri::async_runtime::spawn(async move {
                    // Signal the embedding plugin to embed this note
                    h.emit("embed-request", serde_json::json!({ "note_id": id })).ok();
                });
            }
        }
    });

    // Daily maintenance trigger (call this from scheduler at midnight)
    let handle3 = app.clone();
    app.listen("daily-maintenance", move |_| {
        let h = handle3.clone();
        tauri::async_runtime::spawn(async move {
            h.emit("agent-task", serde_json::json!({
                "agent": "DistillationAgent",
                "task": "daily_distill"
            })).ok();
        });
    });
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────
// Routes Koog tool calls to the correct Rust module.
// Returns (result_json, error_string).

async fn dispatch_tool_call(
    app: &AppHandle,
    req: ToolRequest,
) -> (serde_json::Value, Option<String>) {
    match req.tool.as_str() {

        // Note tools
        "note_read" => {
            let filename = req.args["filename"].as_str().unwrap_or("").to_string();
            match crate::notes::note_read(app.clone(), filename).await {
                Ok(note) => (serde_json::to_value(note).unwrap(), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }
        "note_create" => {
            let title = req.args["title"].as_str().unwrap_or("").to_string();
            let content = req.args["content"].as_str().map(|s| s.to_string());
            let tags = req.args["tags"].as_array().map(|a|
                a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
            );
            match crate::notes::note_create(app.clone(), title, content, tags, None).await {
                Ok(note) => (serde_json::to_value(note).unwrap(), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }
        "note_search" => {
            let query = req.args["query"].as_str().unwrap_or("").to_string();
            match crate::notes::note_search(app.clone(), query, Some(10)).await {
                Ok(results) => (serde_json::to_value(results).unwrap(), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }

        // Kanban tools
        "kanban_card_create" => {
            let board = req.args["board"].as_str().unwrap_or("").to_string();
            let title = req.args["title"].as_str().unwrap_or("").to_string();
            let column = req.args["column"].as_str().unwrap_or("Backlog").to_string();
            match crate::kanban::kanban_card_create(
                app.clone(), board, title, column,
                None, None, None, None, None
            ).await {
                Ok(card) => (serde_json::to_value(card).unwrap(), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }
        "kanban_card_move" => {
            let board = req.args["board"].as_str().unwrap_or("").to_string();
            let card_id = req.args["card_id"].as_str().unwrap_or("").to_string();
            let column = req.args["column"].as_str().unwrap_or("").to_string();
            match crate::kanban::kanban_card_move(app.clone(), board, card_id, column).await {
                Ok(card) => (serde_json::to_value(card).unwrap(), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }

        // Agent memory (always routed through Rust)
        "memory_get" => {
            let session = req.args["session"].as_str().unwrap_or("").to_string();
            let key = req.args["key"].as_str().unwrap_or("").to_string();
            match crate::storage::storage_agent_memory_get(app.clone(), session, key).await {
                Ok(val) => (serde_json::to_value(val).unwrap(), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }
        "memory_set" => {
            let session = req.args["session"].as_str().unwrap_or("").to_string();
            let key = req.args["key"].as_str().unwrap_or("").to_string();
            let value = req.args["value"].as_str().unwrap_or("").to_string();
            match crate::storage::storage_agent_memory_set(app.clone(), session, key, value).await {
                Ok(_) => (serde_json::Value::Bool(true), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }

        // Calendar tools (via google.rs)
        "calendar_list" => {
            match crate::google::google_calendar_list(app.clone()).await {
                Ok(events) => (serde_json::to_value(events).unwrap(), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }
        "calendar_create" => {
            let title = req.args["title"].as_str().unwrap_or("").to_string();
            let start = req.args["start"].as_str().unwrap_or("").to_string();
            let end = req.args["end"].as_str().map(|s| s.to_string());
            match crate::google::google_calendar_create(app.clone(), title, start, end, None).await {
                Ok(event) => (serde_json::to_value(event).unwrap(), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }

        // Cloud escalation (API keys never leave Rust)
        "cloud_generate" => {
            let provider = req.args["provider"].as_str().unwrap_or("anthropic").to_string();
            let messages = req.args["messages"].clone();
            match crate::providers::providers_stream(app.clone(), provider, messages, None).await {
                Ok(response) => (serde_json::Value::String(response), None),
                Err(e) => (serde_json::Value::Null, Some(e)),
            }
        }

        unknown => (
            serde_json::Value::Null,
            Some(format!("unknown tool: {}", unknown))
        ),
    }
}

// ── Emit helpers ──────────────────────────────────────────────────────────────

pub fn emit_event(app: &AppHandle, event: AppEvent) {
    app.emit("app-event", event).ok();
}
