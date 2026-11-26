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

// Entries may be bare hosts ("github.com", "localhost:3000", "*.github.com"), hosts with a
// path, or pasted URLs. Parsed with the URL parser so punycode/IPv6 forms match tab URLs;
// a leading "*." or "." is dropped (a host entry already covers its subdomains).
// Port rule: an entry with a port matches only that port (a tab's default port counts as
// 80/443); an entry without a port matches any port.
function normalizeHost(w) {
  const t = String(w).trim().toLowerCase();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(t) ? t : 'http://' + t);
    const host = u.hostname.replace(/^(\*\.|\.)/, '');
    return host ? { host, port: u.port } : null;
  } catch { return null; }
}
const DEFAULT_PORTS = { 'http:': '80', 'https:': '443', 'ftp:': '21', 'ws:': '80', 'wss:': '443' };
function hostOf(url) {
  try { const u = new URL(url); return u.hostname ? { host: u.hostname.toLowerCase(), port: u.port || DEFAULT_PORTS[u.protocol] || '' } : null; } catch { return null; }
}

// Builds a url -> boolean predicate for a whitelist: host equals an entry or is a subdomain of one.
function hostMatcher(whitelist = []) {
  const entries = whitelist.map(normalizeHost).filter(Boolean);
  if (!entries.length) return () => false;
  return (url) => {
    const h = hostOf(url);
    return !!h && entries.some((e) => (h.host === e.host || h.host.endsWith('.' + e.host)) && (!e.port || e.port === h.port));
  };
}

// True when the url's host is a protected domain (or a subdomain of one). Used to keep
// protected tabs out of every phase and out of AI prompts.
export function isProtectedHost(url, whitelist = []) {
  return hostMatcher(whitelist)(url);
}

// Drops destructive actions (close/discard/delete) targeting a whitelisted host,
// so users can protect domains ("never touch github.com") outright.
export function applyWhitelist(items, whitelist = []) {
  if (!whitelist.some((w) => normalizeHost(w))) return items;
  const PROTECTED = new Set(['closeTab', 'discardTab', 'deleteBookmark']);
  const matches = hostMatcher(whitelist);
  return items.filter((it) => !(PROTECTED.has(it.action) && matches(it.data && it.data.url)));
}

// Folder-protection predicate shared by applyFolderProtection and the organize
// payload filter: protected when inside the Bookmarks Bar (if protectBookmarkBar)
// or when the folder's path contains a protectedFolders entry.
export function folderGuard(opts = {}) {
  const { protectBookmarkBar = true, protectedFolders = [], folders = [], barId = BAR_ID } = opts;
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
  return { byId, pathProtected, inBar, blocked };
}

// Enforces the categorize protections deterministically, regardless of what the
// model proposed: never move out of / into the Bookmarks Bar (when protected),
// never touch a whitelisted folder's subtree, never remove a root. Only the
// organize actions are affected; `folders` is the inventory from collectTree.
export function applyFolderProtection(items, opts = {}) {
  const { protectBookmarkBar = true, protectedFolders = [], folders = [], rootIds = ROOT_IDS, barId = BAR_ID } = opts;
  const ORGANIZE = new Set(['moveBookmark', 'removeFolder', 'deleteBookmark']);
  if (!items.some((it) => ORGANIZE.has(it.action))) return items;
  const { byId, pathProtected, inBar, blocked } = folderGuard({ protectBookmarkBar, protectedFolders, folders, barId });
  return items.filter((it) => {
    if (!ORGANIZE.has(it.action)) return true;
    const d = it.data || {};
    if (it.action === 'removeFolder') {
      if (rootIds.has(d.folderId)) return false;
      return !blocked(d.folderId);
    }
    // Stale/duplicate/dead-link cleanup never deletes inside a protected folder or the protected bar.
    if (it.action === 'deleteBookmark') return !blocked(d.parentId);
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
