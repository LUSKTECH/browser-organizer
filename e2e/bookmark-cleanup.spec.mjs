import { test, expect, send } from './fixtures.mjs';

// Duplicate-bookmark cleanup is local and deterministic (no CLI, no network).
test.describe.configure({ mode: 'serial' });

const createBookmark = (panel, node) =>
  panel.evaluate((n) => new Promise((r) => chrome.bookmarks.create(n, r)), node);
const getBookmark = (panel, id) =>
  panel.evaluate((i) => new Promise((r) => {
    chrome.bookmarks.get(i, (res) => { void chrome.runtime.lastError; r((res && res[0]) || null); });
  }), id);
const searchBookmarks = (panel, url) =>
  panel.evaluate((u) => new Promise((r) => chrome.bookmarks.search({ url: u }, r)), url);

test('detects a duplicate bookmark, deletes it on apply, and restores it on undo', async ({ panel }) => {
  // Two bookmarks that normalize to the same url (trailing slash differs).
  const b1 = await createBookmark(panel, { parentId: '1', title: 'MDN', url: 'https://developer.mozilla.org/en-US/docs/Web' });
  const b2 = await createBookmark(panel, { parentId: '1', title: 'MDN copy', url: 'https://developer.mozilla.org/en-US/docs/Web/' });
  expect(b1.id).toBeTruthy();
  expect(b2.id).toBeTruthy();

  const run = await send(panel, { cmd: 'run', features: { cleanBookmarks: true, dupeTabs: false, groupTabs: false, staleTabs: false, importantBookmarks: false, deadLinkScan: false } });
  expect(run.ok, run.error).toBeTruthy();

  const deletes = (await send(panel, { cmd: 'getPlan' })).items.filter((i) => i.action === 'deleteBookmark');
  const dupItem = deletes.find((i) => i.data.bookmarkId === b1.id || i.data.bookmarkId === b2.id);
  expect(dupItem, 'a duplicate bookmark should be flagged for deletion').toBeTruthy();

  const applied = await send(panel, { cmd: 'apply', itemIds: [dupItem.itemId] });
  expect(applied.applied.length).toBe(1);
  expect(await getBookmark(panel, dupItem.data.bookmarkId)).toBeFalsy();

  // Undo restores a bookmark with the deleted url.
  const undo = (await send(panel, { cmd: 'getUndo' })).entries.filter((e) => e.action === 'deleteBookmark');
  expect(undo.length).toBeGreaterThan(0);
  await send(panel, { cmd: 'undo', undoIds: undo.map((e) => e.undoId) });
  await expect.poll(async () => (await searchBookmarks(panel, dupItem.data.url)).length).toBeGreaterThan(0);
});
