import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapGroupResult, mapStaleResult, mapImportantResult, validatePlanItem, indexById } from '../extension/lib/plan.js';

const tabs = [
  { tabId: 1, title: 'A', url: 'https://a.com', windowId: 9, index: 0, pinned: false, idleDays: 40 },
  { tabId: 2, title: 'B', url: 'https://b.com', windowId: 9, index: 1, pinned: false, idleDays: 50 },
];
const byId = indexById(tabs);

test('mapGroupResult only emits a window when 2+ of the group tabs land there', () => {
  const tabs = [
    { tabId: 1, title: 'A', url: 'https://a.com', windowId: 9, index: 0, pinned: false, idleDays: 1 },
    { tabId: 2, title: 'B', url: 'https://b.com', windowId: 9, index: 1, pinned: false, idleDays: 1 },
    { tabId: 3, title: 'C', url: 'https://c.com', windowId: 7, index: 0, pinned: false, idleDays: 1 },
  ];
  const byId = indexById(tabs);
  const items = mapGroupResult([{ name: 'Work', color: 'blue', tabIds: [1, 2, 3] }], byId);
  assert.equal(items.length, 1); // window 7 has only 1 of the group's tabs, so it's dropped
  const w9 = items.find((i) => i.data.windowId === 9);
  assert.deepEqual(w9.data.tabIds.sort(), [1, 2]);
  assert.equal(w9.data.members.length, 2);
  assert.equal(w9.data.members[0].title, 'A');
  assert.equal(items.find((i) => i.data.windowId === 7), undefined);
});

test('mapStaleResult resolves tab details and dedupes missing tabs', () => {
  const items = mapStaleResult([
    { tabId: 1, reason: 'old', suggestBookmark: true },
    { tabId: 99, reason: 'gone', suggestBookmark: false },
  ], byId);
  assert.equal(items.length, 1);
  assert.equal(items[0].action, 'closeTab');
  assert.equal(items[0].data.tabId, 1);
  assert.equal(items[0].data.url, 'https://a.com');
  assert.equal(items[0].data.bookmarkFirst, true);
});

test('mapImportantResult builds createBookmark items', () => {
  const items = mapImportantResult([{ tabId: 2, folderPath: ['Dev'], reason: 'ref' }], byId);
  assert.equal(items[0].action, 'createBookmark');
  assert.deepEqual(items[0].data.folderPath, ['Dev']);
  assert.equal(items[0].data.url, 'https://b.com');
});

test('validatePlanItem rejects malformed items', () => {
  assert.equal(validatePlanItem({ itemId: 'x', action: 'closeTab', status: 'pending', data: {} }), true);
  assert.equal(validatePlanItem({ action: 'nope' }), false);
  assert.equal(validatePlanItem(null), false);
});

test('mapStaleResult drops tabIds outside the candidate set (injection guard)', () => {
  const tabs = [
    { tabId: 1, title: 'A', url: 'https://a.com', windowId: 9, index: 0, pinned: false, idleDays: 40 },
    { tabId: 2, title: 'B', url: 'https://b.com', windowId: 9, index: 1, pinned: false, idleDays: 5 },
  ];
  const byId = indexById(tabs);
  const candidateIds = new Set([1]); // only tab 1 was sent as a candidate
  const items = mapStaleResult([{ tabId: 1, reason: 'old' }, { tabId: 2, reason: 'injected' }], byId, candidateIds);
  assert.equal(items.length, 1);
  assert.equal(items[0].data.tabId, 1);
});

test('mapStaleResult emits discardTab for suspend disposition', () => {
  const tabs = [{ tabId: 5, title: 'Docs', url: 'https://d.com', windowId: 1, index: 0, pinned: false, idleDays: 30 }];
  const byId = indexById(tabs);
  const items = mapStaleResult([{ tabId: 5, reason: 'keep but idle', action: 'suspend' }], byId, new Set([5]));
  assert.equal(items[0].action, 'discardTab');
  assert.equal(items[0].data.tabId, 5);
});
