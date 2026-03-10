// crypto.ts — Typed invoke() wrappers for vault operations
// All encryption lives in vault.rs. This file is TSX-facing only.
// Never import aes-gcm or argon2 here — Rust owns all crypto.
// Components import from here, never call vault commands directly.

import { invoke } from '@tauri-apps/api/core'
import type { VaultNote, VaultStatus } from './types'

// ── Vault lifecycle ───────────────────────────────────────────────────────────

/** Called once during onboarding to create the vault with an initial PIN. */
export async function vaultInit(pin: string): Promise<void> {
  return invoke<void>('vault_init', { pin })
}

/** Unlock with PIN. Returns true if correct, false if wrong. */
export async function vaultUnlockPin(pin: string): Promise<boolean> {
  return invoke<boolean>('vault_unlock_pin', { pin })
}

/**
 * Unlock with biometric.
 * The Kotlin BiometricPlugin performs the native prompt, decrypts the wrapped
 * master key via Android KeyStore, and passes raw key bytes to vault.rs.
 * This wrapper triggers that flow via tauri-plugin-biometric.
 */
export async function vaultUnlockBiometric(): Promise<boolean> {
  try {
    // tauri-plugin-biometric shows the native prompt
    await invoke('plugin:biometric|authenticate', {
      reason: 'Unlock your ViBo vault',
      title: 'ViBo',
      // Android-specific: use device credential as fallback
      allowDeviceCredential: true,
    })
    // On success, vault.rs is already unlocked by the Kotlin plugin callback
    return true
  } catch {
    return false
  }
}

/** Zero the master key from memory. App should gate behind lock screen after. */
export async function vaultLock(): Promise<void> {
  return invoke<void>('vault_lock')
}

/** Returns current lock state and note count. Safe to call before unlock. */
export async function vaultStatus(): Promise<VaultStatus> {
  return invoke<VaultStatus>('vault_status')
}

/** Change PIN — re-encrypts all vault notes with new key derivation. */
export async function vaultChangePin(oldPin: string, newPin: string): Promise<void> {
  return invoke<void>('vault_change_pin', { old_pin: oldPin, new_pin: newPin })
}

// ── Vault CRUD ────────────────────────────────────────────────────────────────
// All operations require vault to be unlocked — Rust enforces this.

/** Create an encrypted note. id should be a UUID. */
export async function vaultCreate(
  id: string,
  title: string,
  content: string,
  tags?: string[],
): Promise<VaultNote> {
  return invoke<VaultNote>('vault_create', {
    id,
    title,
    content,
    tags: tags ?? null,
  })
}

/** Decrypt and return a vault note by id. Throws if locked or not found. */
export async function vaultRead(id: string): Promise<VaultNote> {
  return invoke<VaultNote>('vault_read', { id })
}

/** Overwrite the content of an existing vault note (re-encrypts). */
export async function vaultWrite(id: string, content: string): Promise<VaultNote> {
  return invoke<VaultNote>('vault_write', { id, content })
}

/** Permanently delete a vault note. Requires vault to be unlocked. */
export async function vaultDelete(id: string): Promise<void> {
  return invoke<void>('vault_delete', { id })
}

/** List all vault notes (decrypts metadata only — content not included). */
export async function vaultList(): Promise<VaultNote[]> {
  return invoke<VaultNote[]>('vault_list')
}

// ── Keystore (API keys) ───────────────────────────────────────────────────────
// API keys stored in encrypted SQLite via providers.rs keystore commands.
// These wrappers are for SettingsView.tsx / CloudProvidersSection.tsx.

/** Store an API key by name. Encrypted at rest in vault SQLite. */
export async function keystoreSet(keyName: string, value: string): Promise<void> {
  return invoke<void>('keystore_set', { key_name: keyName, value })
}

/** Retrieve an API key by name. Returns null if not found. */
export async function keystoreGet(keyName: string): Promise<string | null> {
  return invoke<string | null>('keystore_get', { key_name: keyName })
}

/** Delete an API key by name. */
export async function keystoreDelete(keyName: string): Promise<void> {
  return invoke<void>('keystore_delete', { key_name: keyName })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Guard: throw a readable error if the vault is locked.
 * Call at the top of any component action that needs vault access.
 */
export async function requireUnlocked(): Promise<void> {
  const status = await vaultStatus()
  if (!status.unlocked) {
    throw new Error('Vault is locked. Please unlock before continuing.')
  }
}

/**
 * Generate a new vault note ID.
 * Uses the Web Crypto API — available in Tauri WebView on all targets.
 */
export function newVaultId(): string {
  return crypto.randomUUID()
}
