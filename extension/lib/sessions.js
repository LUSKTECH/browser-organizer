import { withLock } from './mutex.js';
import { uniqueId } from './ids.js';

function newId() { return uniqueId('s-'); }

// Serializes a read-modify-write over the single `sessions` key so concurrent
// save/rename/delete can't clobber each other. `fn(sessions)` returns the next
// array (or falsy to leave unchanged).
export async function mutateSessions(fn) {
  return withLock('sessions', async () => {
    const sessions = await listSessions();
    const next = await fn(sessions);
    if (next) await saveSessions(next);
    return next;
  });
}

export function buildSession(name, tabs, now = Date.now()) {
  return {
    sessionId: newId(),
    name: name || `Session ${new Date(now).toLocaleString()}`,
    ts: now,
    tabs: tabs.map((t) => ({ url: t.url, title: t.title || '', pinned: !!t.pinned })),
  };
}

// Derives a human-friendly name from the tabs' most common host so unnamed
// sessions aren't just timestamps. Deliberately local + deterministic — no CLI,
// network, or new native-host surface for a cosmetic default.
export function autoSessionName(tabs, now = Date.now()) {
  const hosts = {};
  for (const t of tabs) {
    try { const h = new URL(t.url).hostname.replace(/^www\./, ''); if (h) hosts[h] = (hosts[h] || 0) + 1; } catch { /* skip non-URL tabs */ }
  }
  const top = Object.entries(hosts).sort((a, b) => b[1] - a[1])[0];
  const n = tabs.length;
  if (!top) return `Session ${new Date(now).toLocaleString()}`;
  return `${top[0]} + ${n} tab${n === 1 ? '' : 's'}`;
}

export function addSession(store, session) { return [...store, session]; }
export function removeSession(store, id) { return store.filter((s) => s.sessionId !== id); }
export function renameSession(store, id, name) {
  return store.map((s) => (s.sessionId === id ? { ...s, name: name || s.name } : s));
}

export async function listSessions() {
  const { sessions = [] } = await chrome.storage.local.get('sessions');
  return sessions;
}
export async function saveSessions(sessions) {
  await chrome.storage.local.set({ sessions });
}

// Saves the current window's http tabs as a session. Closes them unless
// deps.close === false ("Save & keep open").
export async function saveCurrentWindowSession(name, deps = {}) {
  const c = deps.chrome || chrome;
  const now = deps.now || Date.now();
  const close = deps.close !== false;
  const win = await c.windows.getCurrent({ populate: true });
  const httpTabs = win.tabs.filter((t) => /^https?:/i.test(t.url || ''));
  const session = buildSession(name || autoSessionName(httpTabs, now), httpTabs, now);
  await mutateSessions((sessions) => addSession(sessions, session));
  if (close) await c.tabs.remove(httpTabs.map((t) => t.id));
  return session;
}

export async function restoreSession(id, deps = {}) {
  const c = deps.chrome || chrome;
  const session = (await listSessions()).find((s) => s.sessionId === id);
  if (!session) return null;
  const win = await c.windows.create({});
  for (const t of session.tabs) await c.tabs.create({ windowId: win.id, url: t.url, pinned: t.pinned, active: false });
  return session;
}
