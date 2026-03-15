// AES-GCM encryption using Web Crypto API with PBKDF2 key derivation from PIN

const SALT_KEY = "zettel-crypto-salt";
const PIN_HASH_KEY = "zettel-pin-hash";
const ENCRYPTED_DATA_KEY = "zettel-encrypted-notes";

function getOrCreateSalt(): Uint8Array {
  const stored = localStorage.getItem(SALT_KEY);
  if (stored) return new Uint8Array(JSON.parse(stored));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, JSON.stringify(Array.from(salt)));
  return salt;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(pin);
  const keyMaterial = await crypto.subtle.importKey(
    "raw", rawKey.buffer as ArrayBuffer, "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(pin + "zettel-verify"));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function setupPin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  localStorage.setItem(PIN_HASH_KEY, hash);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (!stored) return false;
  const hash = await hashPin(pin);
  return hash === stored;
}

export function isPinSetup(): boolean {
  return !!localStorage.getItem(PIN_HASH_KEY);
}

export async function encryptData(data: string, pin: string): Promise<string> {
  const salt = getOrCreateSalt();
  const key = await deriveKey(pin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(data)
  );
  const payload = {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };
  return JSON.stringify(payload);
}

export async function decryptData(encryptedStr: string, pin: string): Promise<string> {
  const salt = getOrCreateSalt();
  const key = await deriveKey(pin, salt);
  const { iv, data } = JSON.parse(encryptedStr);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    new Uint8Array(data)
  );
  return new TextDecoder().decode(decrypted);
}

export function getEncryptedNotes(): string | null {
  return localStorage.getItem(ENCRYPTED_DATA_KEY);
}

export function saveEncryptedNotes(encrypted: string): void {
  localStorage.setItem(ENCRYPTED_DATA_KEY, encrypted);
}

// Agent notes are stored separately, unencrypted (agents always have access)
const AGENT_NOTES_KEY = "zettel-agent-notes";

export function loadAgentNotes(): string {
  return localStorage.getItem(AGENT_NOTES_KEY) || "[]";
}

export function saveAgentNotes(data: string): void {
  localStorage.setItem(AGENT_NOTES_KEY, data);
}
