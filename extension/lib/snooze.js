// Snoozed tabs: pure time math and list helpers (no chrome.* here, so it is unit-testable).
// Entry shape: { id, url, title, wakeAt, createdAt } with times in epoch ms.
// Presets use the browser's local time zone through the Date constructor, so a
// DST change between now and the target is handled by the platform.
import { uniqueId } from './ids.js';

export const SNOOZE_CAP = 200;
const HOUR = 3600000;
const WAKE_HOUR = 9;

const toDate = (now) => (now instanceof Date ? now : new Date(now));

// 'laterToday' | 'tomorrow' | 'nextMonday' -> wake time in epoch ms.
export function presetTime(kind, now = Date.now()) {
  const d = toDate(now);
  switch (kind) {
    case 'laterToday':
      return d.getTime() + 3 * HOUR;
    case 'tomorrow':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, WAKE_HOUR, 0, 0, 0).getTime();
    case 'nextMonday': {
      const ahead = (8 - d.getDay()) % 7 || 7; // Monday is 1; on a Monday this is a full week
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + ahead, WAKE_HOUR, 0, 0, 0).getTime();
    }
    default:
      throw new Error(`Unknown snooze preset: ${kind}`);
  }
}

export function makeSnooze({ url, title, wakeAt }, now = Date.now()) {
  return { id: uniqueId('snz-'), url, title: title || '', wakeAt, createdAt: toDate(now).getTime() };
}

// Storage can hold anything; an entry without a finite wakeAt can never be scheduled.
export const hasWakeTime = (e) => Number.isFinite(e?.wakeAt);

// A snooze entry the list UI can show and the wake code can open.
export const isSnoozeEntry = (e) => e != null && typeof e === 'object' && typeof e.id === 'string' && typeof e.url === 'string' && hasWakeTime(e);
export const cleanSnoozed = (list) => (Array.isArray(list) ? list.filter(isSnoozeEntry) : []);

// After a failed reopen an entry carries retryAt (always >= wakeAt); that is when it is next due.
const dueAt = (e) => (Number.isFinite(e.retryAt) ? Math.max(e.wakeAt, e.retryAt) : e.wakeAt);

export function dueSnoozed(list, now = Date.now()) {
  const t = toDate(now).getTime();
  return list.filter((e) => hasWakeTime(e) && dueAt(e) <= t);
}

// An entry still marked `waking` was interrupted mid-wake, so it counts as due right away.
export function nextWake(list) {
  const times = list.filter(hasWakeTime).map((e) => (Number.isFinite(e.waking) ? e.waking : dueAt(e)));
  return times.length ? Math.min(...times) : null;
}

const RETRY_BASE = 5 * 60000;
const RETRY_MAX = 6 * HOUR;
export const retryDelay = (attempts) => Math.min(RETRY_BASE * 2 ** Math.max(0, attempts - 1), RETRY_MAX);

// Splits tabs into what can be snoozed and a count of what cannot. Private (incognito) tabs are
// never stored: the snooze list lives in persistent storage, which would leak the page.
export function selectSnoozable(tabs, { ignorePinned = true } = {}) {
  const targets = [];
  let privateCount = 0;
  for (const t of tabs) {
    if (t.incognito === true) privateCount += 1;
    else if (/^https?:/i.test(t.url || '') && !(ignorePinned && t.pinned)) targets.push(t);
  }
  return { targets, skipped: tabs.length - targets.length, privateCount };
}

// Notification text for snoozing one tab (the keyboard command). `res` is the snoozeTabsNow result,
// `tab` the tab that was asked for; when nothing was snoozed the tab says why.
export function snoozeNoticeText(res, tab, { ignorePinned = true } = {}) {
  if (res && res.snoozed > 0) return 'Snoozed until tomorrow 9:00';
  if (!tab) return 'No tab to snooze';
  if (tab.incognito === true) return 'Not snoozed: private (incognito) tabs are never snoozed';
  if (!/^https?:/i.test(tab.url || '')) return "Not snoozed: browser pages can't be snoozed";
  if (ignorePinned && tab.pinned) return 'Not snoozed: the tab is pinned';
  return 'Not snoozed';
}

const MIN_AHEAD = 60000;
const MAX_AHEAD = 366 * 24 * HOUR;

// Returns an error message for a wake time that is not usable, or null when it is fine.
export function wakeAtError(wakeAt, now = Date.now()) {
  if (typeof wakeAt !== 'number' || !Number.isFinite(wakeAt)) return 'Pick a valid date and time.';
  const t = toDate(now).getTime();
  if (wakeAt < t + MIN_AHEAD) return 'Pick a time at least a minute from now.';
  if (wakeAt > t + MAX_AHEAD) return 'Pick a time within a year from now.';
  return null;
}

// Phase 1 (caller holds the lock): mark what to wake with `waking: now` and persist that, so a
// worker that dies later leaves a trail. Entries already marked are interrupted wakes from an
// earlier attempt and are picked up regardless of their time.
async function markWaking({ read, write, ids, now }) {
  const list = await read();
  const valid = list.filter(hasWakeTime);
  const wanted = ids ? valid.filter((e) => ids.includes(e.id)) : [...new Set([...dueSnoozed(valid, now), ...valid.filter((e) => e.waking != null)])];
  const picked = wanted.map((entry) => ({ entry, resumed: entry.waking != null }));
  const chosen = new Set(wanted);
  if (picked.length || valid.length !== list.length) await write(valid.map((e) => (chosen.has(e) ? { ...e, waking: now } : e)));
  return picked;
}

// Phase 2 (no lock held): open each entry, skipping resumed ones whose URL is already open.
async function openAll(picked, { open, openUrls }) {
  const openNow = new Set(picked.some((p) => p.resumed) ? await openUrls() : []);
  const done = new Set();
  const failed = new Set();
  for (const { entry, resumed } of picked) {
    if (resumed && openNow.has(entry.url)) { done.add(entry.id); continue; }
    try { await open(entry); done.add(entry.id); } catch (err) { console.warn('[organizer] could not reopen snoozed tab:', err); failed.add(entry.id); }
  }
  return { done, failed };
}

// Phase 3 (caller holds the lock): drop the opened entries, back off the failed ones.
async function settle({ read, write, done, failed, now }) {
  const rest = (await read()).filter(hasWakeTime).filter((e) => !done.has(e.id)).map((e) => {
    if (!failed.has(e.id)) return e;
    const { waking, ...kept } = e;
    const attempts = (e.attempts || 0) + 1;
    return { ...kept, attempts, retryAt: now + retryDelay(attempts) };
  });
  await write(rest);
  return rest;
}

// Wakes the entries named by `ids` (or every due one when `ids` is null) without ever losing one:
// mark under the lock, open outside it, then remove the opened ones under the lock. A crash after
// marking leaves the entry stored, and the next call reopens it unless a tab with that exact URL
// is already open. Failed opens stay stored with attempts/retryAt (exponential backoff).
// `lock` wraps the two storage phases; callers serialize whole calls themselves.
// Entries with no usable wakeAt are dropped. Returns { woke, rest }.
export async function wakeEntries({ read, write, open, openUrls = async () => [], lock = (fn) => fn(), ids = null, now = Date.now() }) {
  const picked = await lock(() => markWaking({ read, write, ids, now }));
  if (!picked.length) return { woke: 0, rest: (await read()).filter(hasWakeTime) };
  const { done, failed } = await openAll(picked, { open, openUrls });
  const rest = await lock(() => settle({ read, write, done, failed, now }));
  return { woke: done.size, rest };
}

// Alarm/startup entry point: wake what is due; if anything throws, try again in a minute.
export async function reconcileSnoozes({ wake, notify, rearm, retryMs = 60000, now = Date.now }) {
  try {
    const n = await wake();
    if (n) await notify(n);
  } catch (err) {
    console.warn('[organizer] snooze reconcile failed:', err);
    try { await rearm(now() + retryMs); } catch (e) { console.warn('[organizer] could not rearm snooze alarm:', e); }
  }
}

// Returns a new list; throws (leaving the input untouched) if it would exceed the cap.
export function addSnoozes(list, entries, cap = SNOOZE_CAP) {
  if (list.length + entries.length > cap) {
    throw new Error(`Too many snoozed tabs: the limit is ${cap}, and ${list.length} ${list.length === 1 ? 'is' : 'are'} already snoozed.`);
  }
  return [...list, ...entries];
}
