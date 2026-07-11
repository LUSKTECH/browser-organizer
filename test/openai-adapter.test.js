import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openaiAdapter, resolveBase, resolveModel, resolveKey } from '../native-host/adapters/openai.js';
import { getAdapter } from '../native-host/adapters/registry.js';

test('the registry resolves the openai adapter by name', () => {
  assert.equal(getAdapter('openai').name, 'openai');
});

const KEY = 'BROWSER_ORGANIZER_OPENAI_API_KEY';
const BASE = 'BROWSER_ORGANIZER_OPENAI_BASE_URL';
const MODEL = 'BROWSER_ORGANIZER_OPENAI_MODEL';

// Snapshot + restore the three env vars around each test so they don't leak.
function withEnv(vars, fn) {
  const prev = {};
  for (const k of [KEY, BASE, MODEL]) { prev[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, vars);
  return (async () => { try { return await fn(); } finally {
    for (const k of [KEY, BASE, MODEL]) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
  } })();
}

function okJson(body) {
  return { ok: true, status: 200, async json() { return body; }, async text() { return JSON.stringify(body); } };
}
function errRes(status, text) {
  return { ok: false, status, async json() { return {}; }, async text() { return text; } };
}

test('run posts to chat/completions with bearer auth and returns trimmed content', async () => {
  await withEnv({ [KEY]: 'sk-test' }, async () => {
    let seen = null;
    const fetchFn = (url, opts) => { seen = { url, opts }; return Promise.resolve(okJson({ choices: [{ message: { content: '  {"groups":[]}\n' } }] })); };
    const out = await openaiAdapter.run('PROMPT', { fetchFn });
    assert.equal(out, '{"groups":[]}');
    assert.equal(seen.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(seen.opts.method, 'POST');
    assert.equal(seen.opts.headers.Authorization, 'Bearer sk-test');
    const body = JSON.parse(seen.opts.body);
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.messages[0].content, 'PROMPT');
  });
});

test('run honors base_url (trailing slash stripped) and model overrides', async () => {
  await withEnv({ [KEY]: 'k', [BASE]: 'http://localhost:1234/v1/', [MODEL]: 'llama-3.1-8b' }, async () => {
    let seen = null;
    const fetchFn = (url, opts) => { seen = { url, opts }; return Promise.resolve(okJson({ choices: [{ message: { content: '{}' } }] })); };
    await openaiAdapter.run('p', { fetchFn });
    assert.equal(seen.url, 'http://localhost:1234/v1/chat/completions');
    assert.equal(JSON.parse(seen.opts.body).model, 'llama-3.1-8b');
  });
});

test('run throws when no API key is set', async () => {
  await withEnv({}, async () => {
    await assert.rejects(() => openaiAdapter.run('p', { fetchFn: () => { throw new Error('should not be called'); } }), /API key not set/);
  });
});

test('run throws with status + body on a non-2xx response', async () => {
  await withEnv({ [KEY]: 'k' }, async () => {
    const fetchFn = () => Promise.resolve(errRes(401, 'Incorrect API key provided'));
    await assert.rejects(() => openaiAdapter.run('p', { fetchFn }), /OpenAI API 401: Incorrect API key/);
  });
});

test('run throws when the response has no message content', async () => {
  await withEnv({ [KEY]: 'k' }, async () => {
    const fetchFn = () => Promise.resolve(okJson({ choices: [] }));
    await assert.rejects(() => openaiAdapter.run('p', { fetchFn }), /no message content/);
  });
});

test('run maps an aborted request to a timeout error', async () => {
  await withEnv({ [KEY]: 'k' }, async () => {
    const hanging = (url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    });
    await assert.rejects(() => openaiAdapter.run('p', { fetchFn: hanging, timeoutMs: 20 }), /timed out after 20ms/);
  });
});

test('health GETs /models and returns a version; throws on non-2xx / missing key', async () => {
  await withEnv({ [KEY]: 'k', [MODEL]: 'gpt-4o' }, async () => {
    let seen = null;
    const fetchFn = (url, opts) => { seen = { url, method: opts.method }; return Promise.resolve(okJson({ data: [] })); };
    const r = await openaiAdapter.health({ fetchFn });
    assert.equal(seen.url, 'https://api.openai.com/v1/models');
    assert.equal(seen.method, 'GET');
    assert.match(r.version, /openai-compatible \(gpt-4o\)/);
    await assert.rejects(() => openaiAdapter.health({ fetchFn: () => Promise.resolve(errRes(403, 'no')) }), /OpenAI API 403/);
  });
  await withEnv({}, async () => {
    await assert.rejects(() => openaiAdapter.health({ fetchFn: () => {} }), /API key not set/);
  });
});

test('resolvers apply defaults and env overrides', async () => {
  await withEnv({}, async () => {
    assert.equal(resolveKey(), '');
    assert.equal(resolveBase(), 'https://api.openai.com/v1');
    assert.equal(resolveModel(), 'gpt-4o-mini');
  });
  await withEnv({ [KEY]: 'k', [BASE]: 'https://x.ai/v1//', [MODEL]: 'grok' }, async () => {
    assert.equal(resolveKey(), 'k');
    assert.equal(resolveBase(), 'https://x.ai/v1'); // trailing slashes stripped
    assert.equal(resolveModel(), 'grok');
  });
});
