// google.rs — Google Calendar, Gmail, Drive
// All calls go through Rust. OAuth tokens from encrypted SQLite.
// Calendar: read + write. Gmail: read only. Drive: read only.
// Phase 3: route through Arti (Tor).

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start: String,
    pub end: String,
    pub description: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GmailMessage {
    pub id: String,
    pub subject: String,
    pub from: String,
    pub snippet: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub modified: String,
}

async fn get_access_token(app: &AppHandle) -> Result<String, String> {
    let token = crate::oauth::get_valid_token(app, "google").await?;
    Ok(token)
}

#[tauri::command]
pub async fn google_calendar_list(app: AppHandle) -> Result<Vec<CalendarEvent>, String> {
    let token = get_access_token(&app).await?;
    let client = reqwest::Client::new();
    let resp = client
        .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .query(&[("maxResults", "50"), ("orderBy", "startTime"), ("singleEvents", "true")])
        .bearer_auth(&token)
        .send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let items = json["items"].as_array().cloned().unwrap_or_default();
    Ok(items.iter().map(|item| CalendarEvent {
        id: item["id"].as_str().unwrap_or("").to_string(),
        title: item["summary"].as_str().unwrap_or("").to_string(),
        start: item["start"]["dateTime"].as_str()
            .or_else(|| item["start"]["date"].as_str()).unwrap_or("").to_string(),
        end: item["end"]["dateTime"].as_str()
            .or_else(|| item["end"]["date"].as_str()).unwrap_or("").to_string(),
        description: item["description"].as_str().map(|s| s.to_string()),
        location: item["location"].as_str().map(|s| s.to_string()),
    }).collect())
}

#[tauri::command]
pub async fn google_calendar_create(
    app: AppHandle,
    title: String,
    start: String,
    end: Option<String>,
    description: Option<String>,
) -> Result<CalendarEvent, String> {
    let token = get_access_token(&app).await?;
    let end = end.unwrap_or(start.clone());
    let body = serde_json::json!({
        "summary": title,
        "description": description.unwrap_or_default(),
        "start": { "dateTime": start, "timeZone": "UTC" },
        "end": { "dateTime": end, "timeZone": "UTC" }
    });
    let client = reqwest::Client::new();
    let resp = client
        .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(&token)
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;
    let item: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(CalendarEvent {
        id: item["id"].as_str().unwrap_or("").to_string(),
        title,
        start: item["start"]["dateTime"].as_str().unwrap_or("").to_string(),
        end: item["end"]["dateTime"].as_str().unwrap_or("").to_string(),
        description: item["description"].as_str().map(|s| s.to_string()),
        location: None,
    })
}

#[tauri::command]
pub async fn google_calendar_update(
    app: AppHandle,
    event_id: String,
    title: Option<String>,
    start: Option<String>,
    end: Option<String>,
) -> Result<CalendarEvent, String> {
    let token = get_access_token(&app).await?;
    let mut body = serde_json::json!({});
    if let Some(t) = title { body["summary"] = serde_json::Value::String(t); }
    if let Some(s) = &start { body["start"] = serde_json::json!({ "dateTime": s }); }
    if let Some(e) = &end { body["end"] = serde_json::json!({ "dateTime": e }); }
    let client = reqwest::Client::new();
    let resp = client
        .patch(format!("https://www.googleapis.com/calendar/v3/calendars/primary/events/{}", event_id))
        .bearer_auth(&token).json(&body)
        .send().await.map_err(|e| e.to_string())?;
    let item: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(CalendarEvent {
        id: item["id"].as_str().unwrap_or("").to_string(),
        title: item["summary"].as_str().unwrap_or("").to_string(),
        start: item["start"]["dateTime"].as_str().unwrap_or("").to_string(),
        end: item["end"]["dateTime"].as_str().unwrap_or("").to_string(),
        description: item["description"].as_str().map(|s| s.to_string()),
        location: None,
    })
}

#[tauri::command]
pub async fn google_calendar_delete(app: AppHandle, event_id: String) -> Result<(), String> {
    let token = get_access_token(&app).await?;
    let client = reqwest::Client::new();
    client
        .delete(format!("https://www.googleapis.com/calendar/v3/calendars/primary/events/{}", event_id))
        .bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn google_gmail_list(app: AppHandle) -> Result<Vec<GmailMessage>, String> {
    let token = get_access_token(&app).await?;
    let client = reqwest::Client::new();
    let resp = client
        .get("https://www.googleapis.com/gmail/v1/users/me/messages")
        .query(&[("maxResults", "20"), ("labelIds", "INBOX")])
        .bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    // Returns message IDs only — fetch each for details in a real impl
    let messages = json["messages"].as_array().cloned().unwrap_or_default();
    Ok(messages.iter().map(|m| GmailMessage {
        id: m["id"].as_str().unwrap_or("").to_string(),
        subject: String::new(),
        from: String::new(),
        snippet: String::new(),
        date: String::new(),
    }).collect())
}

#[tauri::command]
pub async fn google_gmail_get(app: AppHandle, message_id: String) -> Result<GmailMessage, String> {
    let token = get_access_token(&app).await?;
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("https://www.googleapis.com/gmail/v1/users/me/messages/{}", message_id))
        .bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let headers = json["payload"]["headers"].as_array().cloned().unwrap_or_default();
    let get_header = |name: &str| -> String {
        headers.iter().find(|h| h["name"].as_str() == Some(name))
            .and_then(|h| h["value"].as_str()).unwrap_or("").to_string()
    };
    Ok(GmailMessage {
        id: message_id,
        subject: get_header("Subject"),
        from: get_header("From"),
        snippet: json["snippet"].as_str().unwrap_or("").to_string(),
        date: get_header("Date"),
    })
}

#[tauri::command]
pub async fn google_drive_list(app: AppHandle) -> Result<Vec<DriveFile>, String> {
    let token = get_access_token(&app).await?;
    let client = reqwest::Client::new();
    let resp = client
        .get("https://www.googleapis.com/drive/v3/files")
        .query(&[("pageSize", "20"), ("fields", "files(id,name,mimeType,modifiedTime)")])
        .bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let files = json["files"].as_array().cloned().unwrap_or_default();
    Ok(files.iter().map(|f| DriveFile {
        id: f["id"].as_str().unwrap_or("").to_string(),
        name: f["name"].as_str().unwrap_or("").to_string(),
        mime_type: f["mimeType"].as_str().unwrap_or("").to_string(),
        modified: f["modifiedTime"].as_str().unwrap_or("").to_string(),
    }).collect())
}

#[tauri::command]
pub async fn google_drive_get(app: AppHandle, file_id: String) -> Result<String, String> {
    let token = get_access_token(&app).await?;
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("https://www.googleapis.com/drive/v3/files/{}", file_id))
        .query(&[("alt", "media")])
        .bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}
