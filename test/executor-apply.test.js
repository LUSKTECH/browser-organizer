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

// "Leave pinned tabs alone": grouping would pull a tab out of the pinned strip.
function chromeWithPinned(pinnedIds) {
  const grouped = [];
  return {
    _grouped: grouped,
    tabs: {
      async get(id) { return { id, url: 'https://a.com', pinned: pinnedIds.includes(id) }; },
      async group({ tabIds }) { grouped.push(tabIds); return 7; },
    },
    tabGroups: { async update() {} },
  };
}
const groupItem = { itemId: 'g1', action: 'groupTabs', data: { tabIds: [1, 2], groupName: 'Dev', color: 'blue' } };

test('groupTabs refuses a tab that is pinned now when ignorePinnedTabs is on', async () => {
  const c = chromeWithPinned([2]);
  await assert.rejects(() => applyItem(groupItem, { chrome: c, settings: { ignorePinnedTabs: true } }), ProtectedTargetError);
  assert.deepEqual(c._grouped, []);
});

test('groupTabs treats a missing ignorePinnedTabs as on, and allows pinned tabs only when it is off', async () => {
  await assert.rejects(() => applyItem(groupItem, { chrome: chromeWithPinned([1]), settings: {} }), ProtectedTargetError);
  const c = chromeWithPinned([1]);
  await applyItem(groupItem, { chrome: c, settings: { ignorePinnedTabs: false } });
  assert.deepEqual(c._grouped, [[1, 2]]);
});

// Rules: join an existing group instead of creating one.
function chromeWithGroups(groups, pinnedIds = []) {
  const calls = { group: [], update: [] };
  return {
    _calls: calls,
    tabs: {
      async get(id) { return { id, url: 'https://a.com', windowId: 1, pinned: pinnedIds.includes(id) }; },
      async group(opts) { calls.group.push(opts); return opts.groupId ?? 99; },
    },
    tabGroups: {
      async get(id) { const g = groups.find((x) => x.id === id); if (!g) throw new Error('No group'); return g; },
      async update(id, props) { calls.update.push([id, props]); },
    },
  };
}
const ruleItem = (extra = {}) => ({ itemId: 'rule-r-w1', action: 'groupTabs', data: { tabIds: [1, 2], groupName: 'Dev', color: 'blue', windowId: 1, existingGroupId: 10, ...extra } });

test('groupTabs joins the existing group and leaves its title and color alone', async () => {
  const c = chromeWithGroups([{ id: 10, windowId: 1, title: 'Dev', color: 'red' }]);
  const entry = await applyItem(ruleItem(), { chrome: c, settings: {} });
  assert.deepEqual(c._calls.group, [{ groupId: 10, tabIds: [1, 2] }]);
  assert.deepEqual(c._calls.update, []);
  assert.deepEqual(entry.reverse, { tabIds: [1, 2] }, 'undo ungroups only the tabs this item added');
});

test('groupTabs falls back to a new group when the existing group vanished or moved windows', async () => {
  for (const groups of [[], [{ id: 10, windowId: 2, title: 'Dev' }]]) {
    const c = chromeWithGroups(groups);
    await applyItem(ruleItem(), { chrome: c, settings: {} });
    assert.deepEqual(c._calls.group, [{ tabIds: [1, 2] }]);
    assert.deepEqual(c._calls.update, [[99, { title: 'Dev', color: 'blue' }]]);
  }
});

test('the pinned-tab guard still wins over joining an existing group', async () => {
  const c = chromeWithGroups([{ id: 10, windowId: 1, title: 'Dev' }], [2]);
  await assert.rejects(() => applyItem(ruleItem(), { chrome: c, settings: { ignorePinnedTabs: true } }), ProtectedTargetError);
  assert.deepEqual(c._calls.group, []);
});

// A tab can vanish between planning and applying (e.g. closed as a duplicate by an earlier item).
function chromeWithGone(goneIds, tabWindows = {}) {
  const grouped = [];
  const c = chromeWithGroups([{ id: 10, windowId: 1, title: 'Dev', color: 'red' }]);
  c._grouped = grouped;
  c.tabs.get = async (id) => {
    if (goneIds.includes(id)) throw new Error('No tab');
    return { id, url: 'https://a.com', windowId: tabWindows[id] ?? 1, pinned: false };
  };
  return c;
}

test('groupTabs groups only the tabs that still exist', async () => {
  const c = chromeWithGone([2]);
  const item = { itemId: 'g', action: 'groupTabs', data: { tabIds: [1, 2, 3], groupName: 'Dev', color: 'blue' } };
  const entry = await applyItem(item, { chrome: c, settings: {} });
  assert.deepEqual(c._calls.group, [{ tabIds: [1, 3] }]);
  assert.deepEqual(entry.reverse, { tabIds: [1, 3] });
});

test('groupTabs throws StaleTabError when every tab is gone', async () => {
  const c = chromeWithGone([1, 2, 3]);
  const item = { itemId: 'g', action: 'groupTabs', data: { tabIds: [1, 2, 3], groupName: 'Dev', color: 'blue' } };
  await assert.rejects(() => applyItem(item, { chrome: c, settings: {} }), StaleTabError);
  assert.deepEqual(c._calls.group, []);
});

test('groupTabs does not join a group when a tab has moved to another window; it makes a new group', async () => {
  const c = chromeWithGone([], { 2: 5 });
  await applyItem(ruleItem(), { chrome: c, settings: {} });
  assert.deepEqual(c._calls.group, [{ tabIds: [1, 2] }]);
  assert.equal(c._calls.update.length, 1);
});

test('groupTabs still joins when every tab is live in the group window', async () => {
  const c = chromeWithGone([3]);
  await applyItem(ruleItem({ tabIds: [1, 2, 3] }), { chrome: c, settings: {} });
  assert.deepEqual(c._calls.group, [{ groupId: 10, tabIds: [1, 2] }]);
});
