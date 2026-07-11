// Single source for the app's opaque unique ids (was inlined in 4 places).
export function uniqueId(prefix = '') {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
