import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueSnoozed, nextWake, wakeAtError, wakeEntries, retryDelay, selectSnoozable, cleanSnoozed, reconcileSnoozes } from '../extension/lib/snooze.js';

const BAD = [{ id: 'nan', wakeAt: NaN }, { id: 'str', wakeAt: '5' }, { id: 'none' }];

test('nextWake and dueSnoozed ignore entries without a finite wakeAt', () => {
  const list = [...BAD, { id: 'ok', wakeAt: 100 }];
  assert.equal(nextWake(list), 100);
  assert.equal(nextWake(BAD), null);
  assert.deepEqual(dueSnoozed(list, 200).map((e) => e.id), ['ok']);
  assert.deepEqual(dueSnoozed(BAD, 200), []);
});

test('wakeAtError enforces a minute to a year ahead', () => {
  const now = 1_000_000_000_000;
  assert.equal(wakeAtError(now + 61000, now), null);
  assert.equal(wakeAtError(now + 366 * 86400000, now), null);
  assert.match(wakeAtError(now + 30000, now), /at least a minute/);
  assert.match(wakeAtError(now - 5, now), /at least a minute/);
  assert.match(wakeAtError(now + 367 * 86400000, now), /within a year/);
  for (const bad of [NaN, Infinity, 'soon', undefined, null]) assert.ok(wakeAtError(bad, now));
});

function fakeStore(initial, { failWrites = 0 } = {}) {
  const st = { data: initial, writes: 0 };
  st.read = async () => st.data;
  st.write = async (v) => { st.writes += 1; if (st.writes <= failWrites) throw new Error('quota'); st.data = v; };
  return st;
}

const urlOf = (e) => `https://x/${e.id}`;
const withUrls = (list) => list.map((e) => ({ url: urlOf(e), ...e }));

test('wakeEntries (a) normal wake: marks before opening, removes after', async () => {
  const st = fakeStore(withUrls([{ id: 'a', wakeAt: 1 }, { id: 'b', wakeAt: 999 }]));
  const seen = [];
  const { woke, rest } = await wakeEntries({ ...st, now: 10, open: async (e) => { seen.push([e.id, st.data.map((x) => `${x.id}:${x.waking ?? ''}`)]); } });
  assert.equal(woke, 1);
  assert.deepEqual(seen, [['a', ['a:10', 'b:']]]); // still stored, marked, while it opens
  assert.deepEqual(rest.map((e) => e.id), ['b']);
  assert.deepEqual(st.data, rest);
});

test('wakeEntries runs only the storage phases under the lock', async () => {
  const st = fakeStore(withUrls([{ id: 'a', wakeAt: 1 }]));
  let held = false;
  let openedWhileHeld = null;
  const lock = async (fn) => { held = true; try { return await fn(); } finally { held = false; } };
  await wakeEntries({ ...st, lock, now: 10, open: async () => { openedWhileHeld = held; } });
  assert.equal(openedWhileHeld, false);
});

test('wakeEntries (b) crash after marking: the next run opens the entries', async () => {
  const st = fakeStore(withUrls([{ id: 'a', wakeAt: 9e12 }, { id: 'b', wakeAt: 9e12, waking: 5 }]));
  const opened = [];
  const { woke } = await wakeEntries({ ...st, now: 10, openUrls: async () => [], open: async (e) => opened.push(e.id) });
  assert.deepEqual(opened, ['b']); // marked, not due by time, still picked up
  assert.equal(woke, 1);
  assert.deepEqual(st.data.map((e) => e.id), ['a']);
});

test('wakeEntries (c) crash after opening: removes without reopening', async () => {
  const st = fakeStore(withUrls([{ id: 'a', wakeAt: 1, waking: 5 }, { id: 'b', wakeAt: 1, waking: 5 }]));
  const opened = [];
  const { woke } = await wakeEntries({ ...st, now: 10, openUrls: async () => [urlOf({ id: 'a' })], open: async (e) => opened.push(e.id) });
  assert.deepEqual(opened, ['b']); // 'a' already has a tab with that exact URL
  assert.equal(woke, 2);
  assert.deepEqual(st.data, []);
});

test('wakeEntries (d) open failure keeps the entry with backoff; others unaffected', async () => {
  const st = fakeStore(withUrls([{ id: 'a', wakeAt: 1 }, { id: 'b', wakeAt: 2 }, { id: 'c', wakeAt: 9e12 }]));
  const { woke } = await wakeEntries({ ...st, now: 1000, open: async (e) => { if (e.id === 'a') throw new Error('nope'); } });
  assert.equal(woke, 1);
  const [a, c] = st.data;
  assert.equal(a.id, 'a');
  assert.equal(a.attempts, 1);
  assert.equal(a.retryAt, 1000 + 5 * 60000);
  assert.equal('waking' in a, false);
  assert.equal(c.retryAt, undefined);
  assert.equal(c.wakeAt, 9e12);
});

test('retryDelay doubles from 5 minutes and caps at 6 hours', () => {
  assert.deepEqual([1, 2, 3].map(retryDelay), [300000, 600000, 1200000]);
  assert.equal(retryDelay(8), 6 * 3600000);
  assert.equal(retryDelay(50), 6 * 3600000);
});

test('dueSnoozed and nextWake use retryAt when present, and treat waking as due', () => {
  const list = [{ id: 'a', wakeAt: 1, retryAt: 500 }, { id: 'b', wakeAt: 100 }];
  assert.deepEqual(dueSnoozed(list, 200).map((e) => e.id), ['b']);
  assert.deepEqual(dueSnoozed(list, 500).map((e) => e.id), ['a', 'b']);
  assert.equal(nextWake(list), 100);
  assert.equal(nextWake([list[0]]), 500);
  assert.equal(nextWake([{ id: 'w', wakeAt: 9e12, waking: 7 }, list[0]]), 7);
});

test('a failed entry is not retried before its retryAt', async () => {
  const st = fakeStore(withUrls([{ id: 'a', wakeAt: 1, attempts: 1, retryAt: 5000 }]));
  const opened = [];
  await wakeEntries({ ...st, now: 2000, open: async (e) => opened.push(e.id) });
  assert.deepEqual(opened, []);
  await wakeEntries({ ...st, now: 5000, open: async (e) => opened.push(e.id) });
  assert.deepEqual(opened, ['a']);
});

test('wakeEntries does not open anything when the marking write fails', async () => {
  const st = fakeStore(withUrls([{ id: 'a', wakeAt: 1 }]), { failWrites: 1 });
  let opened = 0;
  await assert.rejects(wakeEntries({ ...st, now: 10, open: async () => { opened += 1; } }));
  assert.equal(opened, 0);
  assert.equal(st.data.length, 1);
});

test('selectSnoozable skips non-http, pinned and incognito tabs', () => {
  const tabs = [
    { id: 1, url: 'https://a' },
    { id: 2, url: 'chrome://settings' },
    { id: 3, url: 'https://p', pinned: true },
    { id: 4, url: 'https://i', incognito: true },
    { id: 5, url: 'http://b', incognito: false },
  ];
  const r = selectSnoozable(tabs, { ignorePinned: true });
  assert.deepEqual(r.targets.map((t) => t.id), [1, 5]);
  assert.equal(r.skipped, 3);
  assert.equal(r.privateCount, 1);
  assert.deepEqual(selectSnoozable(tabs, { ignorePinned: false }).targets.map((t) => t.id), [1, 3, 5]);
});

test('cleanSnoozed drops malformed entries', () => {
  const good = { id: 'a', url: 'https://a', wakeAt: 1 };
  assert.deepEqual(cleanSnoozed([null, 5, 'x', { id: 'b', wakeAt: 1 }, { url: 'u', wakeAt: 1 }, { id: 'c', url: 'u', wakeAt: NaN }, good]), [good]);
  assert.deepEqual(cleanSnoozed(undefined), []);
});

test('reconcileSnoozes notifies, and rearms a minute out when waking throws', async () => {
  const notes = [];
  await reconcileSnoozes({ wake: async () => 2, notify: async (n) => notes.push(n), rearm: async () => assert.fail('no rearm') });
  assert.deepEqual(notes, [2]);
  const armed = [];
  await reconcileSnoozes({ wake: async () => { throw new Error('quota'); }, notify: async () => {}, rearm: async (when) => armed.push(when), now: () => 1000 });
  assert.deepEqual(armed, [61000]);
});

test('wakeEntries by ids ignores the due time, and drops entries with a bad wakeAt', async () => {
  const st = fakeStore([...BAD, { id: 'a', wakeAt: 9e12 }]);
  const opened = [];
  const { woke } = await wakeEntries({ ...st, ids: ['a', 'nan'], now: 10, open: async (e) => opened.push(e.id) });
  assert.equal(woke, 1);
  assert.deepEqual(opened, ['a']);
  assert.deepEqual(st.data, []);
});
