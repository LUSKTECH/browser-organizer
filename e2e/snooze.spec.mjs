import { test, expect, send, countTabsWithUrl } from './fixtures.mjs';

// Snooze: close tabs now, reopen them later. The wake time itself can't be waited for in a test,
// so wake-up is driven through the `wakeSnoozed` message (the same routine the alarm runs).
test.describe.configure({ mode: 'serial' });

const listSnoozed = async (panel) => (await send(panel, { cmd: 'listSnoozed' })).snoozed;

async function openTab(context, panel, url) {
  await (await context.newPage()).goto(url);
  await panel.reload({ waitUntil: 'domcontentloaded' });
}

const tabIdFor = (panel, url) => panel.evaluate(async (u) => (await chrome.tabs.query({ url: `${u}*` }))[0].id, url);

test('snoozing a ticked tab from the UI closes it and lists it under Snoozed', async ({ context, server, panel }) => {
  const url = `${server}/news/sports`;
  await openTab(context, panel, url);
  await panel.click('#tabsPanel summary');
  await panel.locator('#tabList li', { hasText: 'Sports' }).locator('input[type="checkbox"]').check();
  await panel.selectOption('#snoozePreset', 'laterToday');
  await panel.click('#snoozeTabsBtn');

  await expect.poll(() => countTabsWithUrl(panel, url)).toBe(0);
  await expect(panel.locator('#snoozedSummary')).toHaveText('Snoozed (1)');
  await panel.click('#snoozedPanel summary');
  await expect(panel.locator('#snoozedList li')).toHaveCount(1);
  await expect(panel.locator('#snoozedList li')).toContainText('Sports');
  const [entry] = await listSnoozed(panel);
  expect(entry.url).toBe(url);
  expect(entry.wakeAt).toBeGreaterThan(Date.now() + 2.9 * 3600000);
  // One alarm, set to that wake time.
  const alarm = await panel.evaluate(() => chrome.alarms.get('organizer-snooze'));
  expect(alarm.scheduledTime).toBe(entry.wakeAt);
});

test('wakeSnoozed reopens the tab as a background tab and removes the entry', async ({ context, server, panel }) => {
  const url = `${server}/news/tech`;
  await openTab(context, panel, url);
  const id = await tabIdFor(panel, url);
  const res = await send(panel, { cmd: 'snoozeTabs', tabIds: [id], wakeAt: Date.now() + 3600000 });
  expect(res).toMatchObject({ ok: true, snoozed: 1, skipped: 0 });
  expect(await countTabsWithUrl(panel, url)).toBe(0);

  const [entry] = await listSnoozed(panel);
  const woke = await send(panel, { cmd: 'wakeSnoozed', ids: [entry.id] });
  expect(woke).toMatchObject({ ok: true, woke: 1 });
  await expect.poll(() => countTabsWithUrl(panel, url)).toBe(1);
  expect(await listSnoozed(panel)).toEqual([]);
  expect(await panel.evaluate(() => chrome.alarms.get('organizer-snooze'))).toBeFalsy(); // list empty: alarm cleared
  const tab = (await panel.evaluate(async (u) => chrome.tabs.query({ url: `${u}*` }), url))[0];
  expect(tab.active).toBe(false);
});

test('a wake time in the past is rejected', async ({ context, server, panel }) => {
  const url = `${server}/news/politics`;
  await openTab(context, panel, url);
  const id = await tabIdFor(panel, url);
  for (const wakeAt of [Date.now() - 1000, Date.now() + 30000, NaN, 'soon']) {
    const res = await send(panel, { cmd: 'snoozeTabs', tabIds: [id], wakeAt });
    expect(res.ok).toBe(false);
  }
  const far = await send(panel, { cmd: 'snoozeTabs', tabIds: [id], wakeAt: Date.now() + 400 * 86400000 });
  expect(far).toMatchObject({ ok: false, error: expect.stringMatching(/within a year/) });
  expect(await countTabsWithUrl(panel, url)).toBe(1);
  expect(await listSnoozed(panel)).toEqual([]);
});

test('undo of a snooze reopens the tab and removes the entry', async ({ context, server, panel }) => {
  const url = `${server}/react/hooks`;
  await openTab(context, panel, url);
  const id = await tabIdFor(panel, url);
  await send(panel, { cmd: 'snoozeTabs', tabIds: [id], wakeAt: Date.now() + 3600000 });
  expect(await countTabsWithUrl(panel, url)).toBe(0);

  const { entries } = await send(panel, { cmd: 'getUndo' });
  const undoIds = entries.filter((e) => e.action === 'snoozeTab').map((e) => e.undoId);
  expect(undoIds).toHaveLength(1);
  const res = await send(panel, { cmd: 'undo', undoIds });
  expect(res).toMatchObject({ ok: true, undone: 1, failed: 0 });
  await expect.poll(() => countTabsWithUrl(panel, url)).toBe(1);
  expect(await listSnoozed(panel)).toEqual([]);
});

test('a pinned tab is skipped while "Leave pinned tabs alone" is on', async ({ context, server, panel }) => {
  const url = `${server}/react/router`;
  await openTab(context, panel, url);
  const id = await tabIdFor(panel, url);
  await panel.evaluate((i) => chrome.tabs.update(i, { pinned: true }), id);
  const res = await send(panel, { cmd: 'snoozeTabs', tabIds: [id], wakeAt: Date.now() + 3600000 });
  expect(res).toMatchObject({ ok: true, snoozed: 0, skipped: 1 });
  expect(await countTabsWithUrl(panel, url)).toBe(1);
  expect(await listSnoozed(panel)).toEqual([]);
});

test('the custom date path shows the bounds error in the status line', async ({ context, server, panel }) => {
  const url = `${server}/react/docs`;
  await openTab(context, panel, url);
  await panel.click('#tabsPanel summary');
  await panel.locator('#tabList li', { hasText: 'Documentation' }).locator('input[type="checkbox"]').check();
  await panel.selectOption('#snoozePreset', 'custom');
  await panel.fill('#snoozeCustom', '2099-01-01T09:00');
  await panel.click('#snoozeTabsBtn');
  await expect(panel.locator('#statusText')).toContainText('within a year');
  expect(await countTabsWithUrl(panel, url)).toBe(1);
});

test('snoozing every tab of a window keeps the window with one blank tab', async ({ server, panel }) => {
  const url = `${server}/news/tech`;
  const winId = await panel.evaluate(async (u) => (await chrome.windows.create({ url: u })).id, url);
  await expect.poll(() => panel.evaluate(async (w) => (await chrome.tabs.query({ windowId: w })).map((t) => t.url), winId)).toEqual([url]);
  const tabId = await panel.evaluate(async (w) => (await chrome.tabs.query({ windowId: w }))[0].id, winId);
  const res = await send(panel, { cmd: 'snoozeTabs', tabIds: [tabId], wakeAt: Date.now() + 3600000 });
  expect(res).toMatchObject({ ok: true, snoozed: 1 });
  const left = await panel.evaluate(async (w) => (await chrome.tabs.query({ windowId: w })).length, winId);
  expect(left).toBe(1);
  expect(await countTabsWithUrl(panel, url)).toBe(0);
});

test('an entry with a corrupt wakeAt is dropped and does not stop the others', async ({ panel }) => {
  await panel.evaluate(() => chrome.storage.local.set({ snoozed: [
    { id: 'bad1', url: 'http://example.com/a', title: '', wakeAt: 'soon', createdAt: 1 },
    { id: 'bad2', url: 'http://example.com/b', title: '', createdAt: 1 },
  ] }));
  expect(await send(panel, { cmd: 'wakeSnoozed', ids: [] })).toMatchObject({ ok: true, woke: 0 });
  expect(await listSnoozed(panel)).toEqual([]);
});

test('a snooze refused over the cap leaves the window alone (no blank tab added)', async ({ server, panel }) => {
  const url = `${server}/news/tech`;
  const winId = await panel.evaluate(async (u) => (await chrome.windows.create({ url: u })).id, url);
  await expect.poll(() => panel.evaluate(async (w) => (await chrome.tabs.query({ windowId: w })).length, winId)).toBe(1);
  const tabId = await panel.evaluate(async (w) => (await chrome.tabs.query({ windowId: w }))[0].id, winId);
  const full = Array.from({ length: 200 }, (_, i) => ({ id: `fill${i}`, url: `http://example.com/${i}`, title: '', wakeAt: Date.now() + 9e6, createdAt: 1 }));
  await panel.evaluate((snoozed) => chrome.storage.local.set({ snoozed }), full);
  const res = await send(panel, { cmd: 'snoozeTabs', tabIds: [tabId], wakeAt: Date.now() + 3600000 });
  expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/Too many snoozed/) });
  expect(await panel.evaluate(async (w) => (await chrome.tabs.query({ windowId: w })).map((t) => t.url), winId)).toEqual([url]);
  await panel.evaluate(() => chrome.storage.local.set({ snoozed: [] }));
});

test('listSnoozed drops a null entry instead of failing', async ({ panel }) => {
  await panel.evaluate(() => chrome.storage.local.set({ snoozed: [null, { id: 'ok', url: 'http://example.com/ok', title: '', wakeAt: Date.now() + 9e6, createdAt: 1 }] }));
  const list = await listSnoozed(panel);
  expect(list.map((e) => e.id)).toEqual(['ok']);
  await panel.evaluate(() => chrome.storage.local.set({ snoozed: [] }));
});
