import { claudeAdapter } from './claude.js';

const ADAPTERS = new Map([[claudeAdapter.name, claudeAdapter]]);

export function getAdapter(name) {
  const a = ADAPTERS.get(name);
  if (!a) throw new Error(`Unknown adapter: ${name}`);
  return a;
}

export function registerAdapter(adapter) {
  ADAPTERS.set(adapter.name, adapter);
}
