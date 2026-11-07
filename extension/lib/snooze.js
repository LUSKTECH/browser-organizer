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

export function dueSnoozed(list, now = Date.now()) {
  const t = toDate(now).getTime();
  return list.filter((e) => hasWakeTime(e) && e.wakeAt <= t);
}

export function nextWake(list) {
  const times = list.filter(hasWakeTime).map((e) => e.wakeAt);
  return times.length ? Math.min(...times) : null;
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

// Wakes the entries named by `ids` (or every due one when `ids` is null). The caller holds the
// 'snoozed' lock. Entries leave storage BEFORE they open, so a crash in between can lose a tab's
// reopen but never duplicates it; an entry whose open throws is put back to retry later.
// Entries with no usable wakeAt are dropped. Returns { woke, rest } (rest = what is stored now).
export async function wakeEntries({ read, write, open, ids = null, now = Date.now() }) {
  const list = await read();
  const valid = list.filter(hasWakeTime);
  const picked = ids ? valid.filter((e) => ids.includes(e.id)) : dueSnoozed(valid, now);
  const gone = new Set(picked);
  const rest = valid.filter((e) => !gone.has(e));
  if (picked.length || valid.length !== list.length) await write(rest);
  const failed = [];
  for (const entry of picked) {
    try { await open(entry); } catch (err) { console.warn('[organizer] could not reopen snoozed tab:', err); failed.push(entry); }
  }
  if (!failed.length) return { woke: picked.length, rest };
  const back = [...rest, ...failed];
  await write(back);
  return { woke: picked.length - failed.length, rest: back };
}

// Returns a new list; throws (leaving the input untouched) if it would exceed the cap.
export function addSnoozes(list, entries, cap = SNOOZE_CAP) {
  if (list.length + entries.length > cap) {
    throw new Error(`Too many snoozed tabs: the limit is ${cap}, and ${list.length} ${list.length === 1 ? 'is' : 'are'} already snoozed.`);
  }
  return [...list, ...entries];
}
