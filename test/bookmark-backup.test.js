import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/chrome-mock.js';
import {
  needsBackup, buildSnapshot, toTree, toNetscapeHtml, addToRing, saveSnapshot, listSnapshots, getSnapshot,
  pruneSnapshots, restoreSnapshot, MAX_SNAPSHOTS, MAX_SNAPSHOT_BYTES,
} from '../extension/lib/bookmark-backup.js';

beforeEach(() => installChromeMock());

const tree = () => [{ id: '0', children: [
  { id: '1', title: 'Bookmarks bar', children: [
    { id: '10', title: 'Dev', dateAdded: 1700000000000, children: [{ id: '11', title: 'MDN <docs> & "more"', url: 'https://mdn.dev/?a=1&b=2', dateAdded: 1700000001000 }] },
    { id: '12', title: 'News', url: 'https://news.example/' },
  ] },
  { id: '2', title: 'Other bookmarks', children: [{ id: '20', title: 'Loose', url: 'https://loose.example/' }] },
] }];

test('needsBackup is true only for batches that delete or rearrange bookmarks', () => {
  assert.equal(needsBackup([{ action: 'closeTab' }, { action: 'groupTabs' }, { action: 'createBookmark' }]), false);
  assert.equal(needsBackup([{ action: 'closeTab' }, { action: 'deleteBookmark' }]), true);
  assert.equal(needsBackup([{ action: 'moveBookmark' }]), true);
  assert.equal(needsBackup([{ action: 'removeFolder' }]), true);
  assert.equal(needsBackup([]), false);
});

test('buildSnapshot flattens the tree, skips the synthetic root, and counts only bookmarks', () => {
  const s = buildSnapshot(tree(), 5);
  assert.equal(s.ts, 5);
  assert.equal(s.count, 3);
  assert.deepEqual(s.nodes.filter((n) => n.parentId === '0').map((n) => n.id), ['1', '2']);
  assert.equal(s.nodes.find((n) => n.id === '11').parentId, '10');
  assert.ok(!s.nodes.some((n) => n.id === '0'));
});

test('toTree restores nesting and order from the flat nodes', () => {
  const t = toTree(buildSnapshot(tree()));
  assert.deepEqual(t.map((r) => r.title), ['Bookmarks bar', 'Other bookmarks']);
  assert.deepEqual(t[0].children.map((c) => c.title), ['Dev', 'News']);
  assert.equal(t[0].children[0].children[0].url, 'https://mdn.dev/?a=1&b=2');
});

test('toNetscapeHtml escapes markup and keeps the structure', () => {
  const html = toNetscapeHtml(buildSnapshot(tree()));
  assert.match(html, /^<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
  assert.ok(html.includes('<A HREF="https://mdn.dev/?a=1&amp;b=2" ADD_DATE="1700000001">MDN &lt;docs&gt; &amp; &quot;more&quot;</A>'), html);
  assert.ok(html.includes('<H3 ADD_DATE="1700000000">Dev</H3>'));
  assert.equal((html.match(/<DL><p>/g) || []).length, (html.match(/<\/DL><p>/g) || []).length, 'balanced lists');
});

test('addToRing keeps the newest MAX_SNAPSHOTS, and an oversized snapshot evicts the rest', () => {
  let list = [];
  for (let i = 1; i <= MAX_SNAPSHOTS + 2; i++) list = addToRing(list, { id: `s${i}`, ts: i, count: 0, nodes: [] });
  assert.deepEqual(list.map((s) => s.id), ['s3', 's4', 's5']);
  const huge = { id: 'big', ts: 9, count: 0, nodes: [{ id: 'x', parentId: '0', index: 0, title: 'x'.repeat(MAX_SNAPSHOT_BYTES) }] };
  assert.deepEqual(addToRing(list, huge).map((s) => s.id), ['big']);
});

test('saveSnapshot/listSnapshots/getSnapshot round-trip via storage.local, newest first, metadata only', async () => {
  await saveSnapshot(buildSnapshot(tree(), 1));
  const id2 = await saveSnapshot(buildSnapshot(tree(), 2));
  const list = await listSnapshots();
  assert.deepEqual(list.map((s) => s.ts), [2, 1]);
  assert.deepEqual(Object.keys(list[0]).sort(), ['count', 'id', 'ts']);
  assert.equal((await getSnapshot(id2)).nodes.length, 6);
  assert.equal(await getSnapshot('nope'), null);
});

test('pruneSnapshots drops snapshots older than the retention window', async () => {
  const day = 86400000;
  await saveSnapshot(buildSnapshot(tree(), 1000));
  await saveSnapshot(buildSnapshot(tree(), 1000 + 40 * day));
  const dropped = await pruneSnapshots(1000 + 41 * day, 30);
  assert.equal(dropped, 1);
  assert.equal((await listSnapshots()).length, 1);
});

test('restoreSnapshot rebuilds the tree in a new Restored folder and touches nothing else', async () => {
  const created = [];
  let n = 100;
  const chromeApi = { bookmarks: { async create(node) { const c = { id: String(n++), ...node }; created.push(c); return c; } } };
  const count = await restoreSnapshot(buildSnapshot(tree(), Date.UTC(2026, 9, 1, 12, 30)), '2', chromeApi);
  assert.equal(count, 3);
  assert.equal(created[0].title, 'Restored 2026-10-01 12:30');
  assert.equal(created[0].parentId, '2');
  const bar = created.find((c) => c.title === 'Bookmarks bar');
  assert.equal(bar.parentId, created[0].id);
  const mdn = created.find((c) => c.url === 'https://mdn.dev/?a=1&b=2');
  assert.equal(mdn.parentId, created.find((c) => c.title === 'Dev').id);
  assert.ok(created.every((c) => c.parentId !== undefined));
});
