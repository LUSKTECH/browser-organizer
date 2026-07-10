// Minimal in-memory chrome.* for unit tests. Install with installChromeMock(),
// which sets globalThis.chrome and returns it for direct assertions.
export function installChromeMock(overrides = {}) {
  const store = { local: {}, sync: {}, session: {} };
  const area = (name) => ({
    async get(keys) {
      if (keys == null) return { ...store[name] };
      if (typeof keys === 'string') return { [keys]: store[name][keys] };
      const out = {};
      for (const k of Object.keys(keys)) out[k] = store[name][k] ?? keys[k];
      return out;
    },
    async set(obj) { Object.assign(store[name], obj); },
    async remove(key) { delete store[name][key]; },
  });
  const chrome = {
    _store: store,
    storage: { local: area('local'), sync: area('sync'), session: area('session') },
    ...overrides,
  };
  globalThis.chrome = chrome;
  return chrome;
}
