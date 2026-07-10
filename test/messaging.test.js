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
