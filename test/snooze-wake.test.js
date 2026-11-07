import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueSnoozed, nextWake, wakeAtError, wakeEntries } from '../extension/lib/snooze.js';

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

test('wakeEntries removes entries from storage before opening them', async () => {
  const st = fakeStore([{ id: 'a', wakeAt: 1 }, { id: 'b', wakeAt: 999 }]);
  const seen = [];
  const { woke, rest } = await wakeEntries({ ...st, now: 10, open: async (e) => { seen.push([e.id, st.data.map((x) => x.id)]); } });
  assert.equal(woke, 1);
  assert.deepEqual(seen, [['a', ['b']]]); // already gone from storage when it opened
  assert.deepEqual(rest.map((e) => e.id), ['b']);
});

test('wakeEntries puts back an entry whose open fails', async () => {
  const st = fakeStore([{ id: 'a', wakeAt: 1 }, { id: 'b', wakeAt: 2 }]);
  const { woke, rest } = await wakeEntries({ ...st, now: 10, open: async (e) => { if (e.id === 'a') throw new Error('nope'); } });
  assert.equal(woke, 1);
  assert.deepEqual(st.data.map((e) => e.id), ['a']);
  assert.deepEqual(rest, st.data);
});

test('wakeEntries does not open anything when the removal write fails', async () => {
  const st = fakeStore([{ id: 'a', wakeAt: 1 }], { failWrites: 1 });
  let opened = 0;
  await assert.rejects(wakeEntries({ ...st, now: 10, open: async () => { opened += 1; } }));
  assert.equal(opened, 0);
  assert.equal(st.data.length, 1);
});

test('wakeEntries by ids ignores the due time, and drops entries with a bad wakeAt', async () => {
  const st = fakeStore([...BAD, { id: 'a', wakeAt: 9e12 }]);
  const opened = [];
  const { woke } = await wakeEntries({ ...st, ids: ['a', 'nan'], now: 10, open: async (e) => opened.push(e.id) });
  assert.equal(woke, 1);
  assert.deepEqual(opened, ['a']);
  assert.deepEqual(st.data, []);
});
