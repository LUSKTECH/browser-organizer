import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMessage, createMessageReader } from '../native-host/messaging.js';

test('encode then decode round-trips an object', () => {
  const buf = encodeMessage({ hello: 'world', n: 5 });
  const reader = createMessageReader();
  const msgs = reader.push(buf);
  assert.deepEqual(msgs, [{ hello: 'world', n: 5 }]);
});

test('reader reassembles a message split across chunks', () => {
  const buf = encodeMessage({ a: 1 });
  const reader = createMessageReader();
  assert.deepEqual(reader.push(buf.subarray(0, 3)), []);   // partial header
  assert.deepEqual(reader.push(buf.subarray(3)), [{ a: 1 }]);
});

test('reader yields multiple messages from one chunk', () => {
  const combined = Buffer.concat([encodeMessage({ a: 1 }), encodeMessage({ b: 2 })]);
  const reader = createMessageReader();
  assert.deepEqual(reader.push(combined), [{ a: 1 }, { b: 2 }]);
});

test('a malformed frame yields a per-frame error but keeps earlier valid frames', () => {
  // valid frame, then a frame whose body is invalid JSON, then another valid frame
  const bad = Buffer.from('{not json', 'utf8');
  const header = Buffer.alloc(4); header.writeUInt32LE(bad.length, 0);
  const combined = Buffer.concat([encodeMessage({ a: 1 }), header, bad, encodeMessage({ c: 3 })]);
  const reader = createMessageReader();
  const msgs = reader.push(combined);
  assert.deepEqual(msgs[0], { a: 1 });
  assert.equal(msgs[1].id, null);
  assert.match(msgs[1].frameError, /invalid JSON/);
  assert.deepEqual(msgs[2], { c: 3 });
});

test('an over-cap frame length yields an error sentinel and drops the buffer', () => {
  const header = Buffer.alloc(4); header.writeUInt32LE(64 * 1024 * 1024, 0); // > 16 MB cap
  const reader = createMessageReader();
  const msgs = reader.push(Buffer.concat([header, Buffer.from('x')]));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].frameError, /exceeds/);
});

import { isFrameError } from '../native-host/messaging.js';

test('a user message with a frameError field is delivered, not treated as a bad frame', () => {
  const reader = createMessageReader();
  const [m] = reader.push(encodeMessage({ id: 7, frameError: 'x' }));
  assert.deepEqual(m, { id: 7, frameError: 'x' });
  assert.equal(isFrameError(m), false);
});

test('real frame errors are flagged by isFrameError', () => {
  const bad = Buffer.from('{nope', 'utf8');
  const header = Buffer.alloc(4); header.writeUInt32LE(bad.length, 0);
  const [m] = createMessageReader().push(Buffer.concat([header, bad]));
  assert.equal(isFrameError(m), true);
});

test('a 2 MB frame trickled in 64 KiB chunks reassembles', () => {
  const payload = { blob: 'z'.repeat(2 * 1024 * 1024) };
  const buf = encodeMessage(payload);
  const reader = createMessageReader();
  const out = [];
  for (let i = 0; i < buf.length; i += 64 * 1024) out.push(...reader.push(buf.subarray(i, i + 64 * 1024)));
  assert.equal(out.length, 1);
  assert.equal(out[0].blob.length, payload.blob.length);
});
