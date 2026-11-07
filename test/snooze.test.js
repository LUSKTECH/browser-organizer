import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetTime, dueSnoozed, nextWake, addSnoozes, makeSnooze } from '../extension/lib/snooze.js';

const parts = (ms) => { const d = new Date(ms); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getDay()]; };
const local = (...a) => new Date(...a); // local-time Date, so the tests hold in any time zone

test('laterToday is exactly 3 hours ahead, across midnight too', () => {
  const now = local(2026, 0, 31, 22, 30); // Sat 31 Jan 22:30 -> Sun 1 Feb 01:30
  assert.equal(presetTime('laterToday', now), now.getTime() + 3 * 3600000);
  assert.deepEqual(parts(presetTime('laterToday', now)).slice(0, 5), [2026, 2, 1, 1, 30]);
});

test('tomorrow is the next calendar day at 09:00, over a month/year boundary', () => {
  assert.deepEqual(parts(presetTime('tomorrow', local(2026, 5, 10, 8, 0))).slice(0, 5), [2026, 6, 11, 9, 0]);
  assert.deepEqual(parts(presetTime('tomorrow', local(2026, 11, 31, 23, 59))).slice(0, 5), [2027, 1, 1, 9, 0]);
  assert.deepEqual(parts(presetTime('tomorrow', local(2026, 5, 10, 0, 1))).slice(0, 5), [2026, 6, 11, 9, 0]);
});

test('nextMonday: mid-week, Sunday, and a full week when today is Monday', () => {
  // 2026-06-10 is a Wednesday
  assert.deepEqual(parts(presetTime('nextMonday', local(2026, 5, 10, 15, 0))), [2026, 6, 15, 9, 0, 1]);
  // Sunday 14 Jun -> Monday 15 Jun
  assert.deepEqual(parts(presetTime('nextMonday', local(2026, 5, 14, 15, 0))), [2026, 6, 15, 9, 0, 1]);
  // Monday 15 Jun at 07:00 -> Monday 22 Jun (never "today")
  assert.deepEqual(parts(presetTime('nextMonday', local(2026, 5, 15, 7, 0))), [2026, 6, 22, 9, 0, 1]);
  // week boundary over a month: Friday 26 Jun -> Monday 29 Jun; Tuesday 30 Jun -> Monday 6 Jul
  assert.deepEqual(parts(presetTime('nextMonday', local(2026, 5, 26, 9, 0))), [2026, 6, 29, 9, 0, 1]);
  assert.deepEqual(parts(presetTime('nextMonday', local(2026, 5, 30, 9, 0))), [2026, 7, 6, 9, 0, 1]);
});

test('wall-clock presets stay at 09:00 across DST changes', () => {
  // US DST starts 8 Mar 2026 and ends 1 Nov 2026; in zones without DST these still hold.
  assert.deepEqual(parts(presetTime('tomorrow', local(2026, 2, 7, 20, 0))).slice(0, 5), [2026, 3, 8, 9, 0]);
  assert.deepEqual(parts(presetTime('tomorrow', local(2026, 9, 31, 20, 0))).slice(0, 5), [2026, 11, 1, 9, 0]);
  assert.deepEqual(parts(presetTime('nextMonday', local(2026, 2, 6, 20, 0))), [2026, 3, 9, 9, 0, 1]);
  assert.deepEqual(parts(presetTime('nextMonday', local(2026, 9, 30, 20, 0))), [2026, 11, 2, 9, 0, 1]);
});

test('presetTime accepts epoch ms and rejects an unknown preset', () => {
  const now = local(2026, 5, 10, 8, 0);
  assert.equal(presetTime('tomorrow', now.getTime()), presetTime('tomorrow', now));
  assert.throws(() => presetTime('someday', now), /Unknown snooze preset/);
});

test('dueSnoozed returns entries at or before now; nextWake the earliest', () => {
  const list = [{ id: 'a', wakeAt: 100 }, { id: 'b', wakeAt: 50 }, { id: 'c', wakeAt: 200 }];
  assert.deepEqual(dueSnoozed(list, 100).map((e) => e.id), ['a', 'b']);
  assert.deepEqual(dueSnoozed(list, 49), []);
  assert.equal(nextWake(list), 50);
});

test('empty lists: nothing due, no next wake', () => {
  assert.deepEqual(dueSnoozed([], 1), []);
  assert.equal(nextWake([]), null);
});

test('addSnoozes appends, and throws a clear error over the cap without mutating', () => {
  const list = [{ id: 'a' }];
  assert.deepEqual(addSnoozes(list, [{ id: 'b' }]).map((e) => e.id), ['a', 'b']);
  assert.equal(list.length, 1);
  const full = Array.from({ length: 200 }, (_, i) => ({ id: String(i) }));
  assert.equal(addSnoozes(full.slice(0, 199), [{ id: 'x' }]).length, 200); // exactly at the cap is fine
  assert.throws(() => addSnoozes(full, [{ id: 'x' }]), /limit is 200/);
  assert.throws(() => addSnoozes([{ id: 'a' }], [{ id: 'b' }, { id: 'c' }], 2), /limit is 2/);
});

test('makeSnooze builds the entry shape with a unique id', () => {
  const a = makeSnooze({ url: 'https://a', title: 'A', wakeAt: 5 }, 1000);
  const b = makeSnooze({ url: 'https://a', wakeAt: 5 }, 1000);
  assert.deepEqual(Object.keys(a).sort(), ['createdAt', 'id', 'title', 'url', 'wakeAt']);
  assert.equal(a.createdAt, 1000);
  assert.equal(b.title, '');
  assert.notEqual(a.id, b.id);
});
