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
