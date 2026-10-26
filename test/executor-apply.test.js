import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyItem, ProtectedTargetError, StaleTabError } from '../extension/lib/executor.js';

function makeChrome() {
  const removed = [];
  const moved = [];
  return {
    _removed: removed,
    _moved: moved,
    tabs: {
      async get(id) { return { id, url: 'https://github.com/x' }; },
      async remove(id) { removed.push(id); },
    },
    bookmarks: {
      async getChildren() { return []; },
      async create(node) { return { id: '500', ...node }; },
      async remove(id) { removed.push(`bm:${id}`); },
      async get(id) { return [{ id, url: 'https://github.com/x', parentId: '20', index: 4 }]; },
      async move(id, dest) { moved.push({ id, dest }); },
    },
  };
}

test('closeTab throws ProtectedTargetError when the host is whitelisted at apply time', async () => {
  const chrome = makeChrome();
  const item = { action: 'closeTab', data: { tabId: 3, url: 'https://github.com/x', title: 'A', windowId: 1, index: 2, pinned: false, bookmarkFirst: false } };
  await assert.rejects(() => applyItem(item, { chrome, settings: { whitelist: ['github.com'] } }), ProtectedTargetError);
  assert.deepEqual(chrome._removed, []);
});

test('deleteBookmark throws ProtectedTargetError when the host is whitelisted at apply time', async () => {
  const chrome = makeChrome();
  const item = { action: 'deleteBookmark', data: { bookmarkId: '9', parentId: '2', index: 0, title: 't', url: 'https://github.com/x' } };
  await assert.rejects(() => applyItem(item, { chrome, settings: { whitelist: ['github.com'] } }), ProtectedTargetError);
  assert.ok(!chrome._removed.includes('bm:9'));
});

test('moveBookmark checks protection against the LIVE parent, not the plan origin', async () => {
  const chrome = makeChrome();
  const folders = [{ id: '20', parentId: '2', path: ['Other Bookmarks', 'Keep'] }, { id: '21', parentId: '2', path: ['Other Bookmarks', 'Loose'] }];
  const item = { action: 'moveBookmark', data: { bookmarkId: '9', fromParentId: '21', fromIndex: 0, toParentId: '10', title: 't', url: 'https://x.com' } };
  await assert.rejects(
    () => applyItem(item, { chrome, settings: { protectBookmarkBar: true, protectedFolders: ['Keep'] }, folders }),
    ProtectedTargetError,
  );
  assert.deepEqual(chrome._moved, []);
});

test('moveBookmark undo record uses the live parent/index; vanished bookmark throws StaleTabError', async () => {
  const chrome = makeChrome();
  const item = { action: 'moveBookmark', data: { bookmarkId: '9', fromParentId: '21', fromIndex: 0, toParentId: '10', title: 't', url: 'https://x.com' } };
  const entry = await applyItem(item, { chrome });
  assert.deepEqual(entry.reverse, { bookmarkId: '9', parentId: '20', index: 4 });
  chrome.bookmarks.get = async () => { throw new Error('gone'); };
  await assert.rejects(() => applyItem(item, { chrome }), StaleTabError);
});
