import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../native-host/dispatch.js';
import { encodeReply, createMessageReader } from '../native-host/messaging.js';

// Mirrors host.js's per-request path: handle() then encodeReply() for the wire.
async function reply(msg, output) {
  const getAdapter = () => ({ name: 'fake', async run() { return output; }, async health() { return { version: 't' }; } });
  const result = await handle(msg, { getAdapter });
  return createMessageReader().push(encodeReply({ id: msg.id, ok: true, result }))[0];
}

test('a reply over 1 MiB becomes a small error frame carrying the request id', async () => {
  const r = await reply({ id: 7, type: 'prompt', payload: { prompt: 'x' } }, 'a'.repeat(1.1 * 1024 * 1024));
  assert.equal(r.id, 7);
  assert.equal(r.ok, false);
  assert.match(r.error, /reply too large \(\d+ bytes; limit 1 MiB\)/);
  assert.ok(JSON.stringify(r).length < 200);
});

test('a reply under the cap is passed through unchanged', async () => {
  const r = await reply({ id: 8, type: 'prompt', payload: { prompt: 'x' } }, 'ok');
  assert.deepEqual(r, { id: 8, ok: true, result: { raw: 'ok' } });
});
