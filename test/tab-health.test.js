import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateTabs } from '../extension/lib/tab-health.js';

test('findDuplicateTabs keeps the most-recently-active copy, closes the rest', () => {
  const tabs = [
    { tabId: 1, title: 'A', url: 'https://a.com/x', windowId: 9, index: 0, pinned: false, lastActive: 100 },
    { tabId: 2, title: 'A dup', url: 'https://A.com/x/', windowId: 9, index: 1, pinned: false, lastActive: 500 },
    { tabId: 3, title: 'B', url: 'https://b.com', windowId: 9, index: 2, pinned: false, lastActive: 10 },
  ];
  const items = findDuplicateTabs(tabs);
  assert.equal(items.length, 1);
  assert.equal(items[0].action, 'closeTab');
  assert.equal(items[0].data.tabId, 1); // tab 2 is newer, kept; tab 1 closed
});

test('findDuplicateTabs never proposes closing a pinned tab', () => {
  const tabs = [
    { tabId: 1, title: 'A', url: 'https://a.com', windowId: 9, index: 0, pinned: true, lastActive: 1 },
    { tabId: 2, title: 'A', url: 'https://a.com', windowId: 9, index: 1, pinned: false, lastActive: 2 },
  ];
  const items = findDuplicateTabs(tabs);
  assert.ok(items.every((i) => i.data.tabId !== 1));
});

const trackedPair = () => [
  { tabId: 1, title: 'Docs', url: 'https://a.com/docs', windowId: 9, index: 0, pinned: false, lastActive: 100 },
  { tabId: 2, title: 'Docs (newsletter)', url: 'https://a.com/docs?utm_source=news', windowId: 9, index: 1, pinned: false, lastActive: 500 },
];

test('findDuplicateTabs keeps tracking-parameter copies apart by default', () => {
  assert.equal(findDuplicateTabs(trackedPair()).length, 0);
  assert.equal(findDuplicateTabs(trackedPair(), { loose: false }).length, 0);
});

test('findDuplicateTabs { loose } treats tracking-parameter copies as one page and says so', () => {
  const items = findDuplicateTabs(trackedPair(), { loose: true });
  assert.equal(items.length, 1);
  assert.equal(items[0].data.tabId, 1);
  assert.equal(items[0].reason, 'Duplicate of "Docs (newsletter)" (same page, tracking parameters ignored)');
});

test('findDuplicateTabs { loose } keeps the plain reason when the URLs are the same page already', () => {
  const tabs = trackedPair();
  tabs[1].url = 'https://a.com/docs/';
  const [item] = findDuplicateTabs(tabs, { loose: true });
  assert.equal(item.reason, 'Duplicate of "Docs (newsletter)"');
});

test('findDuplicateTabs { loose } never closes a pinned tab and keeps it over a more recent one', () => {
  const tabs = trackedPair();
  tabs[0].pinned = true;
  assert.deepEqual(findDuplicateTabs(tabs, { loose: true }).map((i) => i.data.tabId), [2]);
  tabs[0].pinned = false; tabs[1].pinned = true;
  assert.deepEqual(findDuplicateTabs(tabs, { loose: true }).map((i) => i.data.tabId), [1]);
  tabs[0].pinned = true;
  assert.equal(findDuplicateTabs(tabs, { loose: true }).length, 0);
});

test('findDuplicateTabs { loose } does not merge pages that differ in a real parameter', () => {
  const tabs = trackedPair();
  tabs[1].url = 'https://a.com/docs?page=2&utm_source=news';
  assert.equal(findDuplicateTabs(tabs, { loose: true }).length, 0);
});
