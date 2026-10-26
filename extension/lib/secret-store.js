// Encrypted-at-rest secret storage for the extension (e.g. the OpenAI API key).
//
// - The AES-GCM key is generated NON-EXTRACTABLE and kept in IndexedDB, so its
//   raw bytes can never be read back — even by our own code — only used to
//   encrypt/decrypt. Shared across the service worker and the side panel (same
//   extension origin).
// - Ciphertext lives in chrome.storage.LOCAL (never storage.sync), so secrets are
//   device-local and never replicated across the user's browsers.
//
// This meets the Chrome Web Store "encrypt sensitive data at rest (AES)" bar
// while keeping the key out of storage.sync. It does NOT defend against code
// running inside the extension origin (there is no XSS sink here) — for that,
// use the host-side env var instead.
import { encryptWith, decryptWith } from './crypto-box.js';

const DB_NAME = 'browser-organizer';
const STORE = 'keys';
const KEY_ID = 'secretKey';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, id) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// Atomic insert-if-absent: resolves true if we stored the value, false if a key
// already existed (ConstraintError) — used to settle the cross-context race in
// getCryptoKey without one writer overwriting the other's key.
function idbAdd(db, value, id) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).add(value, id);
    r.onsuccess = () => resolve(true);
    r.onerror = (e) => {
      if (r.error && r.error.name === 'ConstraintError') { e.preventDefault(); resolve(false); }
      else reject(r.error);
    };
  });
}

// Single-flight within this context (service worker OR side panel): concurrent
// callers share one acquisition instead of each generating a key. Reset on
// failure so a later call can retry.
let keyPromise = null;
function getCryptoKey() {
  if (!keyPromise) keyPromise = acquireCryptoKey().catch((e) => { keyPromise = null; throw e; });
  return keyPromise;
}

async function acquireCryptoKey() {
  const db = await openDb();
  const existing = await idbGet(db, KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false /* non-extractable */, ['encrypt', 'decrypt']);
  // Atomic add: if another context (panel vs SW) generated one concurrently, our
  // add fails and we adopt the key it stored, so every context uses the same key
  // and a secret encrypted by one is decryptable by all.
  if (await idbAdd(db, key, KEY_ID)) return key;
  return (await idbGet(db, KEY_ID)) || key;
}

export async function setSecret(name, plaintext) {
  if (!plaintext) return clearSecret(name);
  const blob = await encryptWith(await getCryptoKey(), plaintext);
  const { secrets = {} } = await chrome.storage.local.get('secrets');
  secrets[name] = blob;
  await chrome.storage.local.set({ secrets });
}

export async function getSecret(name) {
  const { secrets = {} } = await chrome.storage.local.get('secrets');
  const blob = secrets[name];
  if (!blob) return '';
  // Key acquisition failing (IndexedDB unavailable) says nothing about the
  // ciphertext, so let it propagate rather than discard a possibly valid secret.
  const key = await getCryptoKey();
  try { return await decryptWith(key, blob); }
  catch {
    // Key rotated (e.g. site data cleared wiped IndexedDB) or corrupt blob: the
    // ciphertext is permanently unreadable, so drop it. That makes hasSecret()
    // false and the UI asks for the key again instead of showing a phantom "saved".
    console.warn(`secret-store: could not decrypt "${name}"; clearing it so it can be re-entered`);
    await clearSecretIfUnchanged(name, blob);
    return '';
  }
}

// Removes `name` only if the stored blob is still the one that failed to decrypt,
// so a secret saved by another context in the meantime is kept.
async function clearSecretIfUnchanged(name, failedBlob) {
  const { secrets = {} } = await chrome.storage.local.get('secrets');
  const cur = secrets[name];
  if (!cur || cur.iv !== failedBlob.iv || cur.ct !== failedBlob.ct) return;
  delete secrets[name];
  await chrome.storage.local.set({ secrets });
}

export async function clearSecret(name) {
  const { secrets = {} } = await chrome.storage.local.get('secrets');
  if (!(name in secrets)) return;
  delete secrets[name];
  await chrome.storage.local.set({ secrets });
}

export async function hasSecret(name) {
  const { secrets = {} } = await chrome.storage.local.get('secrets');
  if (!secrets[name]) return false;
  // Verify the blob is actually readable (one small AES-GCM decrypt; the key is
  // cached per context). Otherwise the panel says "saved" while the worker sees
  // no key. A failed decrypt also self-heals via getSecret's clear. If the key
  // store itself is unavailable we can't tell, so report what is stored.
  try { return Boolean(await getSecret(name)); }
  catch { return true; }
}
