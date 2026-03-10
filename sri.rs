// sri.rs — Semantic Routing Intelligence (additional commands)
// Core routing lives in storage.rs storage_sri_route.
// This module handles embedding storage + velesdb integration.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct EmbedResult {
    pub note_id: String,
    pub stored: bool,
}

/// Store a note embedding in velesdb (called after EmbeddingPlugin encodes)
#[tauri::command]
pub async fn sri_embed_store(
    _app: AppHandle,
    note_id: String,
    _vector: Vec<f32>,
    _text_preview: String,
) -> Result<EmbedResult, String> {
    // TODO: velesdb plugin API call
    // await invoke('plugin:velesdb|insert', { collection: 'notes', id: note_id, vector, metadata })
    Ok(EmbedResult { note_id, stored: true })
}

/// Route a query — thin wrapper, main logic in storage_sri_route
#[tauri::command]
pub async fn sri_route(
    app: AppHandle,
    prompt: String,
) -> Result<crate::storage::SriDecision, String> {
    crate::storage::storage_sri_route(app, prompt).await
}

/// Check semantic cache before spending tokens
#[tauri::command]
pub async fn sri_cache_query(
    app: AppHandle,
    query: String,
) -> Result<Option<String>, String> {
    crate::storage::storage_cache_get(app, query).await
}
