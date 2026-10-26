import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/chrome-mock.js';

// Minimal in-memory IndexedDB: just the open/createObjectStore/get/add surface
// secret-store.js uses. Values (CryptoKeys) are stored by reference.
function installFakeIndexedDb() {
  const stores = new Map();
  const req = () => ({ result: undefined, error: null, onsuccess: null, onerror: null });
  const fire = (r, fn) => queueMicrotask(() => { fn(); r.onsuccess && r.onsuccess({}); });
  globalThis.indexedDB = {
    open() {
      const r = req();
      const db = {
        createObjectStore(name) { if (!stores.has(name)) stores.set(name, new Map()); },
        transaction(name) {
          const m = stores.get(name);
          return { objectStore: () => ({
            get(id) { const q = req(); fire(q, () => { q.result = m.get(id); }); return q; },
            add(value, id) {
              const q = req();
              queueMicrotask(() => {
                if (m.has(id)) { q.error = { name: 'ConstraintError' }; q.onerror && q.onerror({ preventDefault() {} }); }
                else { m.set(id, value); q.onsuccess && q.onsuccess({}); }
              });
              return q;
            },
          }) };
        },
      };
      r.result = db;
      queueMicrotask(() => {
        if (stores.size === 0) r.onupgradeneeded && r.onupgradeneeded({});
        r.onsuccess && r.onsuccess({});
      });
      return r;
    },
  };
  return stores;
}

// secret-store keeps a module-level key promise, so each test imports a fresh copy.
let n = 0;
// eslint-disable-next-line no-unsanitized/method -- test-only, fixed local path with a counter
const load = () => import(`../extension/lib/secret-store.js?t=${++n}`);

beforeEach(() => { installChromeMock(); installFakeIndexedDb(); });

test('setSecret/getSecret round-trips and stores ciphertext only', async () => {
  const s = await load();
  await s.setSecret('openai', 'sk-test-123');
  assert.equal(await s.getSecret('openai'), 'sk-test-123');
  assert.doesNotMatch(JSON.stringify(chrome._store.local.secrets), /sk-test-123/);
});

test('hasSecret is true after set and false after clear / when never set', async () => {
  const s = await load();
  assert.equal(await s.hasSecret('openai'), false);
  await s.setSecret('openai', 'sk-test-123');
  assert.equal(await s.hasSecret('openai'), true);
  await s.clearSecret('openai');
  assert.equal(await s.hasSecret('openai'), false);
  assert.equal(await s.getSecret('openai'), '');
});

test('undecryptable blob (key lost) is cleared: getSecret -> "", hasSecret -> false, one warning', async () => {
  const first = await load();
  await first.setSecret('openai', 'sk-test-123');
  // Simulate clearing site data: IndexedDB (the AES key) is wiped, blob survives.
  installFakeIndexedDb();
  const second = await load();
  const warn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a);
  try {
    assert.equal(await second.getSecret('openai'), '');
  } finally { console.warn = warn; }
  assert.equal(warnings.length, 1);
  assert.equal(await second.hasSecret('openai'), false);
  assert.equal(chrome._store.local.secrets.openai, undefined);
});

test('hasSecret reports false (and self-heals) for a corrupted blob', async () => {
  const s = await load();
  await s.setSecret('openai', 'sk-test-123');
  chrome._store.local.secrets.openai = { iv: 'AAAA', ct: 'AAAA' };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await s.hasSecret('openai'), false);
  } finally { console.warn = warn; }
  assert.equal(chrome._store.local.secrets.openai, undefined);
});
