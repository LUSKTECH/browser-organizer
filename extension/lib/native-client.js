export const HOST_NAME = 'com.browser_organizer.host';

// A long-lived native messaging port keeps the service worker alive while a
// request is in flight, which matters because the CLI can take many seconds.
export function createNativeClient(deps = {}) {
  const connectNative = deps.connectNative || ((name) => chrome.runtime.connectNative(name));
  const timeoutMs = deps.timeoutMs ?? 180000;
  let port = null;
  const pending = new Map();

  function ensurePort() {
    if (port) return port;
    port = connectNative(HOST_NAME);
    port.onMessage.addListener((msg) => {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(new Error(msg.error || 'Native host error'));
    });
    port.onDisconnect.addListener(() => {
      const lastError = globalThis.chrome?.runtime?.lastError;
      const message = (lastError && lastError.message) || 'Native host disconnected';
      for (const [, entry] of pending) { clearTimeout(entry.timer); entry.reject(new Error(message)); }
      pending.clear();
      port = null;
    });
    return port;
  }

  function request(message) {
    const p = ensurePort();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Native host request timed out')); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      p.postMessage({ ...message, id });
    });
  }

  // Intentionally tearing down the port: reject any in-flight requests and clear
  // their timers. Chrome does NOT fire our own onDisconnect listener when we call
  // port.disconnect() ourselves, so without this those promises would hang and
  // their timeout timers would leak until they fire minutes later.
  function disconnect() {
    if (!port) return;
    for (const [, entry] of pending) { clearTimeout(entry.timer); entry.reject(new Error('Native host disconnected')); }
    pending.clear();
    port.disconnect();
    port = null;
  }

  return { request, disconnect };
}
