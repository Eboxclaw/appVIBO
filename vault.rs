// vault.rs — Encrypted note storage
// AES-256-GCM encryption. Argon2id key derivation.
// Mobile: 15MB RAM limit. Desktop: 64MB.
// Biometric unlock via tauri-plugin-biometric.
// Master key lives only in memory — never written to disk.
// Encrypted files: $APPDATA/ViBo/vault/*.md.enc

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use argon2::{
    password_hash::{rand_core::RngCore, SaltString},
    Argon2, Params, PasswordHasher,
};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};

// ── State ─────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct VaultState {
    pub master_key: Mutex<Option<[u8; 32]>>,
}

#[derive(Debug, Serialize)]
pub struct VaultStatus {
    pub unlocked: bool,
    pub note_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultNote {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created: String,
    pub modified: String,
}

// ── Argon2id params (platform-aware) ─────────────────────────────────────────

fn argon2_params() -> Params {
    #[cfg(target_os = "android")]
    {
        // 15MB — safe for mobile, prevents OOM
        Params::new(15_360, 2, 1, None).expect("invalid params")
    }
    #[cfg(not(target_os = "android"))]
    {
        // 64MB — full security on desktop
        Params::new(65_536, 3, 1, None).expect("invalid params")
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn vault_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("vault")
}

fn salt_path(app: &AppHandle) -> PathBuf {
    vault_dir(app).join(".salt")
}

fn key_check_path(app: &AppHandle) -> PathBuf {
    vault_dir(app).join(".keycheck")
}

fn ensure_vault_dir(app: &AppHandle) -> Result<(), String> {
    std::fs::create_dir_all(vault_dir(app)).map_err(|e| e.to_string())
}

fn derive_key(pin: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let params = argon2_params();
    let argon2 = Argon2::default();
    let salt_str = SaltString::encode_b64(salt)
        .map_err(|e| e.to_string())?;
    let hash = argon2
        .hash_password_customized(pin.as_bytes(), None, None, params, &salt_str)
        .map_err(|e| e.to_string())?;
    // Extract raw hash bytes
    let raw = hash.hash.ok_or("no hash output")?;
    let bytes = raw.as_bytes();
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes[..32]);
    Ok(key)
}

fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext)
        .map_err(|e| e.to_string())?;
    // Prepend nonce to ciphertext
    let mut out = nonce.to_vec();
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 {
        return Err("invalid ciphertext".to_string());
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())
}

fn load_or_create_salt(app: &AppHandle) -> Result<Vec<u8>, String> {
    let path = salt_path(app);
    if path.exists() {
        std::fs::read(&path).map_err(|e| e.to_string())
    } else {
        let mut salt = vec![0u8; 32];
        OsRng.fill_bytes(&mut salt);
        std::fs::write(&path, &salt).map_err(|e| e.to_string())?;
        Ok(salt)
    }
}

/// Write an encrypted canary value so we can verify PIN correctness
fn write_key_check(app: &AppHandle, key: &[u8; 32]) -> Result<(), String> {
    let canary = b"vibo-vault-ok";
    let encrypted = encrypt(key, canary)?;
    std::fs::write(key_check_path(app), B64.encode(&encrypted))
        .map_err(|e| e.to_string())
}

fn verify_key_check(app: &AppHandle, key: &[u8; 32]) -> Result<bool, String> {
    let path = key_check_path(app);
    if !path.exists() { return Ok(false); }
    let encoded = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data = B64.decode(&encoded).map_err(|e| e.to_string())?;
    match decrypt(key, &data) {
        Ok(plain) => Ok(plain == b"vibo-vault-ok"),
        Err(_) => Ok(false),
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Called during onboarding to set up the vault with initial PIN
#[tauri::command]
pub async fn vault_init(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
    pin: String,
) -> Result<(), String> {
    ensure_vault_dir(&app)?;
    let salt = load_or_create_salt(&app)?;
    let key = derive_key(&pin, &salt)?;
    write_key_check(&app, &key)?;
    *vault_state.master_key.lock().unwrap() = Some(key);
    Ok(())
}

/// Unlock with PIN
#[tauri::command]
pub async fn vault_unlock_pin(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
    pin: String,
) -> Result<bool, String> {
    let salt = load_or_create_salt(&app)?;
    let key = derive_key(&pin, &salt)?;
    if verify_key_check(&app, &key)? {
        *vault_state.master_key.lock().unwrap() = Some(key);
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Unlock with biometric — key passed from Android KeyStore via Kotlin plugin
/// The Kotlin BiometricPlugin decrypts the wrapped master key and calls this.
#[tauri::command]
pub async fn vault_unlock_biometric(
    vault_state: State<'_, VaultState>,
    key_bytes: Vec<u8>,
) -> Result<bool, String> {
    if key_bytes.len() != 32 {
        return Err("invalid key length".to_string());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    *vault_state.master_key.lock().unwrap() = Some(key);
    Ok(true)
}

#[tauri::command]
pub async fn vault_lock(vault_state: State<'_, VaultState>) -> Result<(), String> {
    // Zero out the key from memory before dropping
    if let Ok(mut guard) = vault_state.master_key.lock() {
        if let Some(ref mut key) = *guard {
            key.iter_mut().for_each(|b| *b = 0);
        }
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn vault_status(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
) -> Result<VaultStatus, String> {
    let unlocked = vault_state.master_key.lock().unwrap().is_some();
    let note_count = if vault_dir(&app).exists() {
        std::fs::read_dir(vault_dir(&app))
            .map(|d| d.filter_map(|e| e.ok())
                .filter(|e| e.path().extension()
                    .and_then(|x| x.to_str()) == Some("enc"))
                .count())
            .unwrap_or(0)
    } else { 0 };
    Ok(VaultStatus { unlocked, note_count })
}

#[tauri::command]
pub async fn vault_create(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
    id: String,
    title: String,
    content: String,
    tags: Option<Vec<String>>,
) -> Result<VaultNote, String> {
    let key = vault_state.master_key.lock().unwrap()
        .ok_or("vault is locked")?;
    ensure_vault_dir(&app)?;
    let now = chrono::Utc::now().to_rfc3339();
    let note = VaultNote {
        id: id.clone(),
        title,
        content,
        tags: tags.unwrap_or_default(),
        created: now.clone(),
        modified: now,
    };
    let json = serde_json::to_vec(&note).map_err(|e| e.to_string())?;
    let encrypted = encrypt(&key, &json)?;
    let path = vault_dir(&app).join(format!("{}.enc", id));
    std::fs::write(&path, B64.encode(&encrypted)).map_err(|e| e.to_string())?;
    Ok(note)
}

#[tauri::command]
pub async fn vault_read(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
    id: String,
) -> Result<VaultNote, String> {
    let key = vault_state.master_key.lock().unwrap()
        .ok_or("vault is locked")?;
    let path = vault_dir(&app).join(format!("{}.enc", id));
    let encoded = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data = B64.decode(&encoded).map_err(|e| e.to_string())?;
    let plain = decrypt(&key, &data)?;
    serde_json::from_slice(&plain).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_write(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
    id: String,
    content: String,
) -> Result<VaultNote, String> {
    let mut note = vault_read(app.clone(), vault_state.clone(), id.clone()).await?;
    note.content = content;
    note.modified = chrono::Utc::now().to_rfc3339();
    let key = vault_state.master_key.lock().unwrap().ok_or("vault is locked")?;
    let json = serde_json::to_vec(&note).map_err(|e| e.to_string())?;
    let encrypted = encrypt(&key, &json)?;
    let path = vault_dir(&app).join(format!("{}.enc", id));
    std::fs::write(&path, B64.encode(&encrypted)).map_err(|e| e.to_string())?;
    Ok(note)
}

#[tauri::command]
pub async fn vault_delete(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
    id: String,
) -> Result<(), String> {
    // Require vault to be unlocked even to delete
    vault_state.master_key.lock().unwrap().ok_or("vault is locked")?;
    let path = vault_dir(&app).join(format!("{}.enc", id));
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_list(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
) -> Result<Vec<VaultNote>, String> {
    let key = vault_state.master_key.lock().unwrap()
        .ok_or("vault is locked")?;
    let dir = vault_dir(&app);
    if !dir.exists() { return Ok(vec![]); }
    let mut notes = vec![];
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("enc") {
            let encoded = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let data = B64.decode(&encoded).map_err(|e| e.to_string())?;
            if let Ok(plain) = decrypt(&key, &data) {
                if let Ok(note) = serde_json::from_slice::<VaultNote>(&plain) {
                    notes.push(note);
                }
            }
        }
    }
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(notes)
}

#[tauri::command]
pub async fn vault_change_pin(
    app: AppHandle,
    vault_state: State<'_, VaultState>,
    old_pin: String,
    new_pin: String,
) -> Result<(), String> {
    // Verify old PIN first
    let salt = load_or_create_salt(&app)?;
    let old_key = derive_key(&old_pin, &salt)?;
    if !verify_key_check(&app, &old_key)? {
        return Err("incorrect current PIN".to_string());
    }
    // Derive new key and re-encrypt all notes
    let new_key = derive_key(&new_pin, &salt)?;
    let dir = vault_dir(&app);
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("enc") {
            let encoded = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let data = B64.decode(&encoded).map_err(|e| e.to_string())?;
            let plain = decrypt(&old_key, &data)?;
            let re_encrypted = encrypt(&new_key, &plain)?;
            std::fs::write(&path, B64.encode(&re_encrypted)).map_err(|e| e.to_string())?;
        }
    }
    write_key_check(&app, &new_key)?;
    *vault_state.master_key.lock().unwrap() = Some(new_key);
    Ok(())
}
