// A tiny per-key async lock. MV3 message handlers run concurrently (each is an
// async IIFE), so read-modify-write cycles over a single chrome.storage key can
// interleave and clobber each other. withLock(key, fn) serializes all fns sharing
// a key: each waits for the previous to settle before running. The chain is kept
// alive across rejections so one failing critical section can't wedge the key.
const chains = new Map();

export function withLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.then(() => fn(), () => fn()); // run fn once the previous holder settles (ok or not)
  chains.set(key, run.then(() => {}, () => {}));
  return run;
}
