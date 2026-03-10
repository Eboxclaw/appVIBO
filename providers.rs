// providers.rs — Cloud AI provider routing
// All API calls go through here. Keys never leave this module.
// PII scrubbing applied before every cloud call.
// Streaming via Tauri events to TSX.
// Phase 3: replace reqwest with Arti client for Tor routing.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_sql::DbPool;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Provider {
    pub name: String,
    pub base_url: String,
    pub provider_type: ProviderType,
    pub has_key: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    Anthropic,
    OpenRouter,
    Kimi,
    Ollama,
    OpenAI,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,  // "user" | "assistant" | "system"
    pub content: String,
}

// ── PII Scrubber ──────────────────────────────────────────────────────────────
// Applied before every cloud call. Runs in Rust — never in Kotlin/TSX.

fn scrub_pii(text: &str) -> String {
    let mut result = text.to_string();

    // Email addresses
    let email_re = regex::Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").unwrap();
    result = email_re.replace_all(&result, "[EMAIL]").to_string();

    // Phone numbers (international + US formats)
    let phone_re = regex::Regex::new(r"\+?[\d\s\-\(\)]{7,15}").unwrap();
    result = phone_re.replace_all(&result, "[PHONE]").to_string();

    // Credit card-like patterns
    let cc_re = regex::Regex::new(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b").unwrap();
    result = cc_re.replace_all(&result, "[CARD]").to_string();

    // IP addresses
    let ip_re = regex::Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").unwrap();
    result = ip_re.replace_all(&result, "[IP]").to_string();

    result
}

fn scrub_messages(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    messages.iter().map(|m| ChatMessage {
        role: m.role.clone(),
        content: scrub_pii(&m.content),
    }).collect()
}

// ── Keystore (API keys encrypted in vault SQLite) ─────────────────────────────

#[tauri::command]
pub async fn keystore_set(
    app: AppHandle,
    key_name: String,
    value: String,
) -> Result<(), String> {
    // Encrypt with AES before storing
    // For now store in a secure SQLite table — encrypted at rest via vault.rs
    let db = app.state::<DbPool>();
    db.execute(
        "CREATE TABLE IF NOT EXISTS keystore (name TEXT PRIMARY KEY, value TEXT NOT NULL)",
        []
    ).await.map_err(|e| e.to_string())?;
    // TODO: encrypt value with vault master key before storing
    db.execute(
        "INSERT OR REPLACE INTO keystore (name, value) VALUES (?1, ?2)",
        (key_name, value)
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn keystore_get(
    app: AppHandle,
    key_name: String,
) -> Result<Option<String>, String> {
    let db = app.state::<DbPool>();
    db.select_one(
        "SELECT value FROM keystore WHERE name = ?1",
        [key_name]
    ).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn keystore_delete(app: AppHandle, key_name: String) -> Result<(), String> {
    let db = app.state::<DbPool>();
    db.execute("DELETE FROM keystore WHERE name = ?1", [key_name])
        .await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── Provider registry ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn providers_list(app: AppHandle) -> Result<Vec<Provider>, String> {
    let db = app.state::<DbPool>();
    db.execute(
        "CREATE TABLE IF NOT EXISTS providers (
            name TEXT PRIMARY KEY,
            base_url TEXT NOT NULL,
            provider_type TEXT NOT NULL
        )", []
    ).await.map_err(|e| e.to_string())?;

    let rows: Vec<(String, String, String)> = db.select(
        "SELECT name, base_url, provider_type FROM providers", []
    ).await.map_err(|e| e.to_string())?;

    let mut providers = rows.into_iter().map(|(name, base_url, pt)| {
        let ptype = match pt.as_str() {
            "anthropic" => ProviderType::Anthropic,
            "openrouter" => ProviderType::OpenRouter,
            "kimi" => ProviderType::Kimi,
            "openai" => ProviderType::OpenAI,
            _ => ProviderType::Ollama,
        };
        Provider { name, base_url, provider_type: ptype, has_key: true }
    }).collect::<Vec<_>>();

    // Always include Ollama (local, no key)
    if !providers.iter().any(|p| p.provider_type == ProviderType::Ollama) {
        providers.push(Provider {
            name: "Ollama (local)".to_string(),
            base_url: "http://localhost:11434".to_string(),
            provider_type: ProviderType::Ollama,
            has_key: false,
        });
    }
    Ok(providers)
}

#[tauri::command]
pub async fn providers_save(
    app: AppHandle,
    name: String,
    base_url: String,
    provider_type: String,
    api_key: Option<String>,
) -> Result<(), String> {
    let db = app.state::<DbPool>();
    db.execute(
        "INSERT OR REPLACE INTO providers (name, base_url, provider_type) VALUES (?1, ?2, ?3)",
        (name.clone(), base_url, provider_type)
    ).await.map_err(|e| e.to_string())?;
    if let Some(key) = api_key {
        keystore_set(app, format!("provider_{}", name), key).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn providers_delete(app: AppHandle, name: String) -> Result<(), String> {
    let db = app.state::<DbPool>();
    db.execute("DELETE FROM providers WHERE name = ?1", [name.clone()])
        .await.map_err(|e| e.to_string())?;
    keystore_delete(app, format!("provider_{}", name)).await
}

#[tauri::command]
pub async fn providers_test(app: AppHandle, name: String) -> Result<bool, String> {
    let key = keystore_get(app.clone(), format!("provider_{}", name)).await?;
    // Simple connectivity check — just verify key exists for now
    Ok(key.is_some())
}

// ── Streaming completion ──────────────────────────────────────────────────────
// Called by Koog via event bus for cloud escalation.
// Called directly from TSX for chat UI.

#[tauri::command]
pub async fn providers_stream(
    app: AppHandle,
    provider: String,
    messages: serde_json::Value,
    model: Option<String>,
) -> Result<String, String> {
    let messages: Vec<ChatMessage> = serde_json::from_value(messages)
        .map_err(|e| e.to_string())?;

    // PII scrub before every cloud call — non-negotiable
    let clean_messages = scrub_messages(&messages);

    let api_key = keystore_get(app.clone(), format!("provider_{}", provider))
        .await?
        .unwrap_or_default();

    match provider.as_str() {
        "anthropic" => stream_anthropic(&app, clean_messages, api_key, model).await,
        "openrouter" => stream_openai_compat(&app, clean_messages, api_key,
            "https://openrouter.ai/api/v1", model).await,
        "kimi" => stream_openai_compat(&app, clean_messages, api_key,
            "https://api.moonshot.cn/v1", model).await,
        "ollama" => stream_openai_compat(&app, clean_messages, String::new(),
            "http://localhost:11434/v1", model).await,
        _ => Err(format!("unknown provider: {}", provider)),
    }
}

async fn stream_anthropic(
    app: &AppHandle,
    messages: Vec<ChatMessage>,
    api_key: String,
    model: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    // Phase 3: replace client with Arti-backed client for Tor routing
    let model = model.unwrap_or("claude-3-5-haiku-20241022".to_string());
    let system = messages.iter().find(|m| m.role == "system")
        .map(|m| m.content.clone());
    let user_messages: Vec<serde_json::Value> = messages.iter()
        .filter(|m| m.role != "system")
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "stream": true,
        "messages": user_messages,
    });
    if let Some(sys) = system {
        body["system"] = serde_json::Value::String(sys);
    }

    let response = client.post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut full_response = String::new();
    let text = response.text().await.map_err(|e| e.to_string())?;

    for line in text.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            if data == "[DONE]" { break; }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = parsed["delta"]["text"].as_str() {
                    full_response.push_str(delta);
                    app.emit("llm-delta", delta).ok();
                }
            }
        }
    }
    app.emit("llm-done", &full_response).ok();
    Ok(full_response)
}

async fn stream_openai_compat(
    app: &AppHandle,
    messages: Vec<ChatMessage>,
    api_key: String,
    base_url: &str,
    model: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let model = model.unwrap_or("gpt-4o-mini".to_string());
    let msgs: Vec<serde_json::Value> = messages.iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();
    let body = serde_json::json!({
        "model": model,
        "stream": true,
        "messages": msgs,
    });
    let mut req = client.post(format!("{}/chat/completions", base_url))
        .header("content-type", "application/json")
        .json(&body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }
    let response = req.send().await.map_err(|e| e.to_string())?;
    let mut full_response = String::new();
    let text = response.text().await.map_err(|e| e.to_string())?;
    for line in text.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            if data == "[DONE]" { break; }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                    full_response.push_str(delta);
                    app.emit("llm-delta", delta).ok();
                }
            }
        }
    }
    app.emit("llm-done", &full_response).ok();
    Ok(full_response)
}
