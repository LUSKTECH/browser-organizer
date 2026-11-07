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

export function dueSnoozed(list, now = Date.now()) {
  const t = toDate(now).getTime();
  return list.filter((e) => e.wakeAt <= t);
}

export function nextWake(list) {
  return list.length ? Math.min(...list.map((e) => e.wakeAt)) : null;
}

// Returns a new list; throws (leaving the input untouched) if it would exceed the cap.
export function addSnoozes(list, entries, cap = SNOOZE_CAP) {
  if (list.length + entries.length > cap) {
    throw new Error(`Too many snoozed tabs: the limit is ${cap}, and ${list.length} ${list.length === 1 ? 'is' : 'are'} already snoozed.`);
  }
  return [...list, ...entries];
}
