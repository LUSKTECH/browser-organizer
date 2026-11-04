import { test, expect, send, countTabsWithUrl } from './fixtures.mjs';

// "Leave pinned tabs alone" (Settings, default on): pinned tabs are locked in the open-tabs
// list, and the service worker refuses to bulk-close them even if asked directly.
test.describe.configure({ mode: 'serial' });

async function pinnedAndPlainTab(context, server, panel) {
  const pinnedUrl = `${server}/react/docs`;
  const plainUrl = `${server}/news/sports`;
  await (await context.newPage()).goto(pinnedUrl);
  await (await context.newPage()).goto(plainUrl);
  const pinnedId = await panel.evaluate(async (u) => {
    const [t] = await chrome.tabs.query({ url: `${u}*` });
    await chrome.tabs.update(t.id, { pinned: true });
    return t.id;
  }, pinnedUrl);
  await panel.reload({ waitUntil: 'domcontentloaded' });
  return { pinnedUrl, plainUrl, pinnedId };
}

test('the open-tabs list locks pinned tabs, Select all skips them, and the worker will not close one', async ({ context, server, panel }) => {
  const { pinnedUrl, plainUrl, pinnedId } = await pinnedAndPlainTab(context, server, panel);
  await panel.click('#tabsPanel summary');
  const pinnedRow = panel.locator('#tabList li', { hasText: '📌' });
  await expect(pinnedRow.locator('input[type="checkbox"]')).toBeDisabled();

  await panel.click('#selectAllTabs');
  await expect(pinnedRow.locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(panel.locator('#tabList li', { hasText: 'sports' }).locator('input[type="checkbox"]')).toBeChecked();

  // Direct message, as if the UI were bypassed: the pinned tab survives.
  const res = await send(panel, { cmd: 'closeTabs', tabIds: [pinnedId] });
  expect(res.ok).toBeTruthy();
  expect(res.closed).toBe(0);
  expect(await countTabsWithUrl(panel, pinnedUrl)).toBe(1);
  expect(await countTabsWithUrl(panel, plainUrl)).toBe(1);
});

test('turning the setting off unlocks pinned tabs again', async ({ context, server, panel }) => {
  const { pinnedId } = await pinnedAndPlainTab(context, server, panel);
  await panel.click('#settings summary');
  await expect(panel.locator('#settingsForm [name=ignorePinnedTabs]')).toBeChecked(); // default on
  await panel.uncheck('#settingsForm [name=ignorePinnedTabs]');
  await panel.click('#settingsForm button[type="submit"]');
  await expect.poll(() => panel.evaluate(async () => (await chrome.storage.sync.get('settings')).settings?.ignorePinnedTabs)).toBe(false);

  await panel.reload({ waitUntil: 'domcontentloaded' });
  await panel.click('#tabsPanel summary');
  await expect(panel.locator('#tabList li', { hasText: '📌' }).locator('input[type="checkbox"]')).toBeEnabled();
  const res = await send(panel, { cmd: 'closeTabs', tabIds: [pinnedId] });
  expect(res.closed).toBe(1);
});
