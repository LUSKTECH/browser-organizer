import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withLock } from '../extension/lib/mutex.js';

test('withLock serializes fns sharing a key', async () => {
  const order = [];
  const a = withLock('k', async () => { await new Promise((r) => setTimeout(r, 20)); order.push('a'); });
  const b = withLock('k', async () => { order.push('b'); });
  await Promise.all([a, b]);
  assert.deepEqual(order, ['a', 'b']); // b waited for a to finish
});

test('withLock lets different keys run concurrently', async () => {
  const order = [];
  const a = withLock('x', async () => { await new Promise((r) => setTimeout(r, 20)); order.push('a'); });
  const b = withLock('y', async () => { order.push('b'); });
  await Promise.all([a, b]);
  assert.deepEqual(order, ['b', 'a']); // b did not wait on the other key
});

test('withLock does not wedge a key when a critical section throws', async () => {
  await assert.rejects(withLock('z', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await withLock('z', async () => 'ok'), 'ok');
});
