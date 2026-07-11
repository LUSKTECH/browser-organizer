const MAX_ENTRIES = 2000;

export async function getUndoLog() {
  const { undoLog = [] } = await chrome.storage.local.get('undoLog');
  return undoLog;
}

export async function recordUndo(entries) {
  const log = await getUndoLog();
  const next = [...log, ...entries].slice(-MAX_ENTRIES);
  await chrome.storage.local.set({ undoLog: next });
}

export function filterUndo(entries, now, retentionDays) {
  const cutoff = now - retentionDays * 86400000;
  return entries.filter((e) => e.ts >= cutoff);
}

export async function pruneUndo(now, retentionDays) {
  const log = await getUndoLog();
  await chrome.storage.local.set({ undoLog: filterUndo(log, now, retentionDays) });
}

export async function reverseEntry(entry, chromeApi = chrome) {
  switch (entry.action) {
    case 'closeTab': {
      const { url, windowId, index, pinned, savedBookmarkId } = entry.reverse;
      await chromeApi.tabs.create({ url, windowId, index, pinned, active: false });
      // Clean up the "Saved before closing" bookmark so undo is a true inverse.
      if (savedBookmarkId) { try { await chromeApi.bookmarks.remove(savedBookmarkId); } catch { /* already gone */ } }
      return;
    }
    case 'groupTabs':
      await chromeApi.tabs.ungroup(entry.reverse.tabIds);
      return;
    case 'createBookmark':
      await chromeApi.bookmarks.remove(entry.reverse.bookmarkId);
      return;
    case 'deleteBookmark': {
      const { parentId, index, title, url } = entry.reverse;
      await chromeApi.bookmarks.create({ parentId, index, title, url });
      return;
    }
    case 'discardTab':
      return; // discard is transparent; the tab reloads on next focus
    default:
      throw new Error(`Cannot reverse action: ${entry.action}`);
  }
}
