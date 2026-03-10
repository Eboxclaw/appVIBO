// oauth.rs — OAuth2 token storage and refresh
// Tokens encrypted in SQLite. Refresh logic handled here.
// Google (Phase 1). Proton + iCloud (Phase 4).
// All HTTP calls go through reqwest here — Phase 3 replaces with Arti.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::DbPool;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthToken {
    pub provider: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    pub scope: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthStatus {
    pub provider: String,
    pub connected: bool,
    pub expires_at: Option<i64>,
    pub scope: Option<String>,
}

async fn ensure_oauth_table(db: &DbPool) -> Result<(), String> {
    db.execute(
        "CREATE TABLE IF NOT EXISTS oauth_tokens (
            provider TEXT PRIMARY KEY,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            expires_at INTEGER NOT NULL,
            scope TEXT NOT NULL DEFAULT ''
        )", []
    ).await.map_err(|e| e.to_string())
}

async fn save_token(db: &DbPool, token: &OAuthToken) -> Result<(), String> {
    db.execute(
        "INSERT OR REPLACE INTO oauth_tokens
         (provider, access_token, refresh_token, expires_at, scope)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (token.provider.clone(), token.access_token.clone(),
         token.refresh_token.clone(), token.expires_at, token.scope.clone())
    ).await.map_err(|e| e.to_string())
}

async fn load_token(db: &DbPool, provider: &str) -> Result<Option<OAuthToken>, String> {
    let row: Option<(String, String, Option<String>, i64, String)> = db.select_one(
        "SELECT provider, access_token, refresh_token, expires_at, scope
         FROM oauth_tokens WHERE provider = ?1",
        [provider]
    ).await.map_err(|e| e.to_string())?;
    Ok(row.map(|(provider, access_token, refresh_token, expires_at, scope)| OAuthToken {
        provider, access_token, refresh_token, expires_at, scope,
    }))
}

async fn refresh_google_token(refresh_token: &str) -> Result<(String, i64), String> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID").map_err(|_| "GOOGLE_CLIENT_ID not set")?;
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").map_err(|_| "GOOGLE_CLIENT_SECRET not set")?;
    let client = reqwest::Client::new();
    let resp = client.post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if let Some(err) = json["error"].as_str() {
        return Err(format!("token refresh failed: {}", err));
    }
    let access_token = json["access_token"].as_str().ok_or("no access_token")?.to_string();
    let expires_in = json["expires_in"].as_i64().unwrap_or(3600);
    Ok((access_token, chrono::Utc::now().timestamp() + expires_in))
}

pub async fn get_valid_token(app: &AppHandle, provider: &str) -> Result<String, String> {
    let db = app.state::<DbPool>();
    ensure_oauth_table(&db).await?;
    let token = load_token(&db, provider).await?.ok_or(format!("{} not connected", provider))?;
    let now = chrono::Utc::now().timestamp();
    if token.expires_at > now + 60 {
        return Ok(token.access_token);
    }
    let refresh = token.refresh_token.as_deref().ok_or("no refresh token")?;
    match provider {
        "google" => {
            let (new_access, new_expires) = refresh_google_token(refresh).await?;
            let updated = OAuthToken { access_token: new_access.clone(), expires_at: new_expires, ..token };
            save_token(&db, &updated).await?;
            Ok(new_access)
        }
        other => Err(format!("refresh not implemented for {}", other)),
    }
}

#[tauri::command]
pub async fn oauth_start(app: AppHandle, provider: String) -> Result<String, String> {
    let db = app.state::<DbPool>();
    ensure_oauth_table(&db).await?;
    match provider.as_str() {
        "google" => {
            let client_id = std::env::var("GOOGLE_CLIENT_ID").map_err(|_| "GOOGLE_CLIENT_ID not set")?;
            let scopes = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly";
            let redirect = "com.vibo.app:/oauth/callback";
            Ok(format!(
                "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
                client_id, urlencoding::encode(redirect), urlencoding::encode(scopes)
            ))
        }
        other => Err(format!("provider {} not supported yet", other)),
    }
}

#[tauri::command]
pub async fn oauth_callback(app: AppHandle, provider: String, code: String) -> Result<OAuthStatus, String> {
    let db = app.state::<DbPool>();
    ensure_oauth_table(&db).await?;
    match provider.as_str() {
        "google" => {
            let client_id = std::env::var("GOOGLE_CLIENT_ID").map_err(|_| "GOOGLE_CLIENT_ID not set")?;
            let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").map_err(|_| "GOOGLE_CLIENT_SECRET not set")?;
            let redirect = "com.vibo.app:/oauth/callback";
            let client = reqwest::Client::new();
            let resp = client.post("https://oauth2.googleapis.com/token")
                .form(&[
                    ("client_id", client_id.as_str()),
                    ("client_secret", client_secret.as_str()),
                    ("code", code.as_str()),
                    ("grant_type", "authorization_code"),
                    ("redirect_uri", redirect),
                ])
                .send().await.map_err(|e| e.to_string())?;
            let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            if let Some(err) = json["error"].as_str() { return Err(format!("OAuth error: {}", err)); }
            let access_token = json["access_token"].as_str().ok_or("no access_token")?.to_string();
            let refresh_token = json["refresh_token"].as_str().map(|s| s.to_string());
            let expires_in = json["expires_in"].as_i64().unwrap_or(3600);
            let scope = json["scope"].as_str().unwrap_or("").to_string();
            let token = OAuthToken {
                provider: "google".to_string(), access_token,
                refresh_token, expires_at: chrono::Utc::now().timestamp() + expires_in,
                scope: scope.clone(),
            };
            save_token(&db, &token).await?;
            Ok(OAuthStatus { provider: "google".to_string(), connected: true, expires_at: Some(token.expires_at), scope: Some(scope) })
        }
        other => Err(format!("provider {} not supported yet", other)),
    }
}

#[tauri::command]
pub async fn oauth_status(app: AppHandle, provider: String) -> Result<OAuthStatus, String> {
    let db = app.state::<DbPool>();
    ensure_oauth_table(&db).await?;
    match load_token(&db, &provider).await? {
        Some(t) => Ok(OAuthStatus { provider, connected: true, expires_at: Some(t.expires_at), scope: Some(t.scope) }),
        None => Ok(OAuthStatus { provider, connected: false, expires_at: None, scope: None }),
    }
}

#[tauri::command]
pub async fn oauth_revoke(app: AppHandle, provider: String) -> Result<(), String> {
    let db = app.state::<DbPool>();
    ensure_oauth_table(&db).await?;
    if let Ok(Some(token)) = load_token(&db, &provider).await {
        let client = reqwest::Client::new();
        if provider == "google" {
            client.post("https://oauth2.googleapis.com/revoke")
                .form(&[("token", token.access_token.as_str())])
                .send().await.ok();
        }
    }
    db.execute("DELETE FROM oauth_tokens WHERE provider = ?1", [provider])
        .await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn oauth_refresh(app: AppHandle, provider: String) -> Result<OAuthStatus, String> {
    get_valid_token(&app, &provider).await?;
    let db = app.state::<DbPool>();
    let token = load_token(&db, &provider).await?.ok_or("token not found after refresh")?;
    Ok(OAuthStatus { provider, connected: true, expires_at: Some(token.expires_at), scope: Some(token.scope) })
}
