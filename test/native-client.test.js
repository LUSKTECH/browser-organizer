import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeClient } from '../extension/lib/native-client.js';

// A fake native port that echoes back a scripted response keyed by message.type.
function makeFakePort(responder) {
  const listeners = { message: [], disconnect: [] };
  return {
    _port: true,
    postMessage(msg) {
      const res = responder(msg);
      if (res) queueMicrotask(() => listeners.message.forEach((fn) => fn({ id: msg.id, ...res })));
    },
    onMessage: { addListener: (fn) => listeners.message.push(fn) },
    onDisconnect: { addListener: (fn) => listeners.disconnect.push(fn) },
    disconnect() { listeners.disconnect.forEach((fn) => fn()); },
    _fireDisconnect() { listeners.disconnect.forEach((fn) => fn()); },
  };
}

test('request resolves with result on matching id', async () => {
  const port = makeFakePort((msg) => (msg.type === 'health' ? { ok: true, result: { ready: true } } : null));
  const client = createNativeClient({ connectNative: () => port });
  const r = await client.request({ type: 'health' });
  assert.deepEqual(r, { ready: true });
});

test('request rejects when host returns ok:false', async () => {
  const port = makeFakePort(() => ({ ok: false, error: 'nope' }));
  const client = createNativeClient({ connectNative: () => port });
  await assert.rejects(() => client.request({ type: 'health' }), /nope/);
});

test('pending requests reject on disconnect', async () => {
  globalThis.chrome = { runtime: { lastError: { message: 'gone' } } };
  const port = makeFakePort(() => null); // never responds
  const client = createNativeClient({ connectNative: () => port });
  const p = client.request({ type: 'health' });
  port._fireDisconnect();
  await assert.rejects(() => p, /gone|disconnected/);
});

test('request rejects on timeout', async () => {
  const port = makeFakePort(() => null);
  const client = createNativeClient({ connectNative: () => port, timeoutMs: 10 });
  await assert.rejects(() => client.request({ type: 'health' }), /timed out/);
});
