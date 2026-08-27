// Shared by orchestrator.js (plan-build time) and executor.js (apply time) so
// both enforce the exact same folder/whitelist protections from the exact same
// code — settings can change between when a plan is built and when it's applied,
// so this can't be a one-shot filter baked into the plan.
import { ROOT_IDS, BAR_ID } from './bookmark-collector.js';

// First root that isn't the bar — the default place new folders are created.
function firstOtherRoot(rootIds, barId) {
  for (const id of rootIds) if (id !== barId) return id;
  return barId;
}

// Drops destructive actions (close/discard/delete) targeting a whitelisted host,
// so users can protect domains ("never touch github.com") outright.
export function applyWhitelist(items, whitelist = []) {
  const hosts = whitelist.map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  if (!hosts.length) return items;
  const PROTECTED = new Set(['closeTab', 'discardTab', 'deleteBookmark']);
  const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };
  const matches = (h) => h && hosts.some((w) => h === w || h.endsWith('.' + w));
  return items.filter((it) => !(PROTECTED.has(it.action) && matches(hostOf(it.data && it.data.url))));
}

// Enforces the categorize protections deterministically, regardless of what the
// model proposed: never move out of / into the Bookmarks Bar (when protected),
// never touch a whitelisted folder's subtree, never remove a root. Only the
// organize actions are affected; `folders` is the inventory from collectTree.
export function applyFolderProtection(items, opts = {}) {
  const { protectBookmarkBar = true, protectedFolders = [], folders = [], rootIds = ROOT_IDS, barId = BAR_ID } = opts;
  const ORGANIZE = new Set(['moveBookmark', 'removeFolder']);
  if (!items.some((it) => ORGANIZE.has(it.action))) return items;
  const byId = new Map(folders.map((f) => [f.id, f]));
  const entries = protectedFolders
    .map((p) => String(p).toLowerCase().split('/').map((s) => s.trim()).filter(Boolean))
    .filter((segs) => segs.length);
  const pathProtected = (pathArr) => {
    if (!pathArr || !entries.length) return false;
    const low = pathArr.map((s) => String(s).toLowerCase());
    return entries.some((segs) => {
      for (let i = 0; i + segs.length <= low.length; i++) {
        if (segs.every((s, k) => low[i + k] === s)) return true;
      }
      return false;
    });
  };
  const inBar = (id) => {
    let cur = id, guard = 0;
    while (cur && guard++ < 100) {
      if (cur === barId) return true;
      cur = byId.get(cur)?.parentId ?? null;
    }
    return false;
  };
  const blocked = (id) => {
    if (!id) return false;
    if (protectBookmarkBar && inBar(id)) return true;
    const f = byId.get(id);
    return f ? pathProtected(f.path) : false;
  };
  return items.filter((it) => {
    if (!ORGANIZE.has(it.action)) return true;
    const d = it.data || {};
    if (it.action === 'removeFolder') {
      if (rootIds.has(d.folderId)) return false;
      return !blocked(d.folderId);
    }
    // moveBookmark
    if (blocked(d.fromParentId)) return false;
    if (d.toParentId) {
      if (blocked(d.toParentId)) return false;
    } else {
      // New-folder target: evaluate the *projected* destination path, so a
      // toRootId of the bar or a toFolderPath under a protected subtree can't
      // slip past the protections (the executor creates under toRootId).
      const rootId = d.toRootId || firstOtherRoot(rootIds, barId);
      if (protectBookmarkBar && inBar(rootId)) return false;
      const rootPath = byId.get(rootId)?.path || [];
      if (pathProtected([...rootPath, ...(d.toFolderPath || [])])) return false;
    }
    return true;
  });
}
