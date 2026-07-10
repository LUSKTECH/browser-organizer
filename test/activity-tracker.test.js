import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markActive, reconcile, idleDays } from '../extension/lib/activity-tracker.js';

const DAY = 86400000;

test('markActive sets lastActive and preserves firstSeen', () => {
  const a = markActive({}, 5, 1000);
  assert.equal(a[5].firstSeen, 1000);
  assert.equal(a[5].lastActive, 1000);
  const b = markActive(a, 5, 2000);
  assert.equal(b[5].firstSeen, 1000);
  assert.equal(b[5].lastActive, 2000);
});

test('reconcile keeps known tabs and seeds new ones from lastAccessed', () => {
  const now = 10 * DAY;
  const prev = { 1: { firstSeen: 0, lastActive: 5 * DAY } };
  const tabs = [{ id: 1 }, { id: 2, lastAccessed: 3 * DAY }, { id: 3 }];
  const next = reconcile(prev, tabs, now);
  assert.equal(next[1].lastActive, 5 * DAY);        // preserved
  assert.equal(next[2].lastActive, 3 * DAY);        // seeded from lastAccessed
  assert.equal(next[3].lastActive, now);            // seeded to now
  assert.equal(Object.keys(next).length, 3);        // closed tabs dropped
});

test('idleDays computes whole days since lastActive', () => {
  assert.equal(idleDays({ lastActive: 0 }, 3 * DAY), 3);
  assert.equal(idleDays(undefined, 5 * DAY), 0);
});
