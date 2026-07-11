import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/chrome-mock.js';
import { buildSession, addSession, removeSession, renameSession, listSessions, saveSessions, saveCurrentWindowSession, autoSessionName } from '../extension/lib/sessions.js';

test('mutateSessions serializes concurrent mutations (no lost update)', async () => {
  installChromeMock();
  const { mutateSessions, buildSession } = await import('../extension/lib/sessions.js');
  await Promise.all([
    mutateSessions((s) => [...s, buildSession('A', [], 1)]),
    mutateSessions((s) => [...s, buildSession('B', [], 2)]),
    mutateSessions((s) => [...s, buildSession('C', [], 3)]),
  ]);
  const names = (await listSessions()).map((s) => s.name).sort();
  assert.deepEqual(names, ['A', 'B', 'C']); // all three survived, none clobbered
});

test('autoSessionName names by the most common host, falls back to timestamp', () => {
  const tabs = [
    { url: 'https://github.com/a' }, { url: 'https://www.github.com/b' }, { url: 'https://news.example/c' },
  ];
  assert.equal(autoSessionName(tabs, 0), 'github.com + 3 tabs');
  assert.equal(autoSessionName([{ url: 'https://x.io/1' }], 0), 'x.io + 1 tab');
  assert.match(autoSessionName([], 0), /^Session /); // no hosts → timestamp
  assert.match(autoSessionName([{ url: 'not a url' }], 0), /^Session /); // unparseable → timestamp
});

test('renameSession updates only the matching session', () => {
  const store = [{ sessionId: 'a', name: 'One' }, { sessionId: 'b', name: 'Two' }];
  const out = renameSession(store, 'b', 'Renamed');
  assert.equal(out.find((s) => s.sessionId === 'b').name, 'Renamed');
  assert.equal(out.find((s) => s.sessionId === 'a').name, 'One');
});

test('saveCurrentWindowSession with close:false keeps tabs open', async () => {
  installChromeMock();
  const removed = [];
  const chromeApi = {
    windows: { async getCurrent() { return { tabs: [{ id: 1, url: 'https://a.com', title: 'A' }, { id: 2, url: 'chrome://x' }] }; } },
    tabs: { async remove(ids) { removed.push(ids); } },
  };
  const s = await saveCurrentWindowSession('Keep', { chrome: chromeApi, close: false, now: 1 });
  assert.equal(s.tabs.length, 1);          // only the http tab saved
  assert.deepEqual(removed, []);           // nothing closed
});

beforeEach(() => installChromeMock());

test('buildSession captures url/title/pinned', () => {
  const s = buildSession('Research', [{ url: 'https://a.com', title: 'A', pinned: false, id: 1, windowId: 1, index: 0 }], 123);
  assert.equal(s.name, 'Research');
  assert.equal(s.ts, 123);
  assert.equal(s.tabs[0].url, 'https://a.com');
  assert.ok(s.sessionId);
});

test('add/remove/list round-trips through storage', async () => {
  const s = buildSession('X', [], 1);
  await saveSessions(addSession([], s));
  assert.equal((await listSessions()).length, 1);
  await saveSessions(removeSession(await listSessions(), s.sessionId));
  assert.equal((await listSessions()).length, 0);
});
