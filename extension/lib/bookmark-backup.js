// Automatic bookmark backups: a snapshot of the whole tree is taken before any run that
// deletes, moves or removes bookmarks, kept locally, and can be exported or restored.
// Restore never overwrites: it rebuilds the snapshot inside a new "Restored <date>" folder.
import { uniqueId } from './ids.js';
import { withLock } from './mutex.js';

const KEY = 'bookmarkSnapshots';
const LOCK = 'backup';
export const MAX_SNAPSHOTS = 3;
export const MAX_SNAPSHOT_BYTES = 2_000_000; // above this, only the newest snapshot is kept
export const SNAPSHOT_MAX_AGE_DAYS = 30;
export const STORAGE_RESERVE_BYTES = 1_000_000; // always leave this much of storage.local free for the undo log and plan

const BOOKMARK_MUTATIONS = new Set(['deleteBookmark', 'moveBookmark', 'removeFolder']);

// Adding a bookmark loses nothing, so only batches that delete or rearrange need a backup.
export function needsBackup(items = []) {
  return items.some((i) => BOOKMARK_MUTATIONS.has(i.action));
}

// `tree` is the result of chrome.bookmarks.getTree(). The synthetic root ('0') is skipped:
// its children are stored with parentId '0' and are the roots a restore recreates.
export function buildSnapshot(tree, now = Date.now()) {
  const nodes = [];
  const walk = (node, parentId, index) => {
    const entry = { id: node.id, parentId, index, title: node.title || '' };
    if (node.url) entry.url = node.url;
    if (node.dateAdded) entry.dateAdded = node.dateAdded;
    nodes.push(entry);
    (node.children || []).forEach((child, i) => walk(child, node.id, i));
  };
  const top = (tree && tree[0] && tree[0].children) || [];
  top.forEach((root, i) => walk(root, '0', i));
  return { id: uniqueId('snap-'), ts: now, count: nodes.filter((n) => n.url).length, nodes };
}

// Nested form of the snapshot: [{ title, url?, children? }], in the original order.
export function toTree(snapshot) {
  const byParent = new Map();
  for (const n of snapshot.nodes) {
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId).push(n);
  }
  const build = (parentId) => (byParent.get(parentId) || [])
    .sort((a, b) => a.index - b.index)
    .map((n) => (n.url ? { title: n.title, url: n.url, dateAdded: n.dateAdded } : { title: n.title, dateAdded: n.dateAdded, children: build(n.id) }));
  return build('0');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const addDate = (n) => (n.dateAdded ? ` ADD_DATE="${Math.floor(n.dateAdded / 1000)}"` : '');

// Netscape bookmark file: importable by Chrome, Edge, Firefox and Safari.
export function toNetscapeHtml(snapshot) {
  const out = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const emit = (nodes, depth) => {
    const pad = '    '.repeat(depth);
    for (const n of nodes) {
      if (n.url) { out.push(`${pad}<DT><A HREF="${esc(n.url)}"${addDate(n)}>${esc(n.title)}</A>`); continue; }
      out.push(`${pad}<DT><H3${addDate(n)}>${esc(n.title)}</H3>`, `${pad}<DL><p>`);
      emit(n.children, depth + 1);
      out.push(`${pad}</DL><p>`);
    }
  };
  emit(toTree(snapshot), 1);
  out.push('</DL><p>');
  return out.join('\n');
}

export function snapshotLabel(snapshot) {
  return `${new Date(snapshot.ts).toISOString().slice(0, 16).replace('T', ' ')} (${snapshot.count} bookmarks)`;
}

async function readAll(storage) {
  return (await storage.get(KEY))[KEY] || [];
}

// Ring buffer of the newest MAX_SNAPSHOTS; an oversized snapshot evicts all older ones.
// Encoded size, not string length: non-ASCII titles take 2-4 bytes per character in storage.
const byteSize = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

export function addToRing(list, snapshot) {
  if (byteSize(snapshot) > MAX_SNAPSHOT_BYTES) return [snapshot];
  return [...list, snapshot].slice(-MAX_SNAPSHOTS);
}

// Saves unless that would leave less than STORAGE_RESERVE_BYTES free: the undo log has to be able to
// record the run that follows, and a missing undo entry is worse than a missing backup.
export function saveSnapshot(snapshot, storage = chrome.storage.local) {
  return withLock(LOCK, async () => {
    const before = await readAll(storage);
    const after = addToRing(before, snapshot);
    if (storage.getBytesInUse && storage.QUOTA_BYTES) {
      const used = await storage.getBytesInUse(null);
      const growth = byteSize(after) - byteSize(before);
      if (used + growth > storage.QUOTA_BYTES - STORAGE_RESERVE_BYTES) {
        throw new Error('not enough free browser storage for a backup (undo still works)');
      }
    }
    await storage.set({ [KEY]: after });
    return snapshot.id;
  });
}

// Metadata only: the nodes can be large and the list is shown in the panel.
export async function listSnapshots(storage = chrome.storage.local) {
  return (await readAll(storage)).map(({ id, ts, count }) => ({ id, ts, count })).sort((a, b) => b.ts - a.ts);
}

export async function getSnapshot(id, storage = chrome.storage.local) {
  return (await readAll(storage)).find((s) => s.id === id) || null;
}

export function pruneSnapshots(now = Date.now(), maxAgeDays = SNAPSHOT_MAX_AGE_DAYS, storage = chrome.storage.local) {
  return withLock(LOCK, async () => {
    const list = await readAll(storage);
    const kept = list.filter((s) => now - s.ts <= maxAgeDays * 86400000);
    if (kept.length !== list.length) await storage.set({ [KEY]: kept });
    return list.length - kept.length;
  });
}

// Recreates the snapshot under a new "Restored <date>" folder inside `parentId` (Other Bookmarks).
// Existing bookmarks are never touched. Returns the number of bookmarks created.
export async function restoreSnapshot(snapshot, parentId, chromeApi = chrome) {
  const label = `Restored ${new Date(snapshot.ts).toISOString().slice(0, 16).replace('T', ' ')}`;
  const holder = await chromeApi.bookmarks.create({ parentId, title: label });
  let created = 0;
  try {
    const make = async (nodes, pid) => {
      for (const n of nodes) {
        if (n.url) { await chromeApi.bookmarks.create({ parentId: pid, title: n.title, url: n.url }); created += 1; continue; }
        const folder = await chromeApi.bookmarks.create({ parentId: pid, title: n.title });
        await make(n.children, folder.id);
      }
    };
    await make(toTree(snapshot), holder.id);
  } catch (err) {
    // Don't leave a half-restored folder behind: a retry would add a second copy of what got through.
    try { await chromeApi.bookmarks.removeTree(holder.id); } catch { /* best effort */ }
    throw err;
  }
  return created;
}
