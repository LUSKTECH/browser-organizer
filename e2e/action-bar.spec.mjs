import { test, expect, send } from './fixtures.mjs';

const seed = (panel, n) => panel.evaluate((count) => new Promise((r) => chrome.storage.local.set({
  currentPlan: Array.from({ length: count }, (_, i) => ({
    itemId: `t-${i}`, action: 'closeTab', status: 'pending', reason: 'synthetic',
    data: { tabId: 900000 + i, title: `Tab ${i}`, url: `https://example.com/${i}` },
  })),
}, r)), n);

test('floating action bar stays reachable and its count tracks the selection', async ({ panel }) => {
  await send(panel, { cmd: 'updatePlan', items: [] });
  await panel.reload({ waitUntil: 'domcontentloaded' });
  await expect(panel.locator('#planActions')).toBeHidden();

  await seed(panel, 150);
  await panel.setViewportSize({ width: 400, height: 800 });
  await panel.reload({ waitUntil: 'domcontentloaded' });
  await expect(panel.locator('#plan .item')).toHaveCount(150);

  await panel.evaluate(() => window.scrollTo(0, document.querySelector('#plan').offsetTop + document.querySelector('#plan').offsetHeight / 2));
  const bar = panel.locator('#planActions');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  const vp = panel.viewportSize();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await expect(panel.locator('#planSelCount')).toHaveText('Nothing selected');
  await expect(panel.locator('#approveSelected')).toBeDisabled();

  await panel.locator('#plan .item input[type="checkbox"]').first().check();
  await expect(panel.locator('#planSelCount')).toHaveText('1 selected');
  await expect(panel.locator('#approveSelected')).toHaveText('Apply selected (1)');
  await expect(panel.locator('#approveSelected')).toBeEnabled();

  await panel.click('#selectAll');
  await expect(panel.locator('#planSelCount')).toHaveText('150 selected');
  await panel.click('#selectNone');
  await expect(panel.locator('#planSelCount')).toHaveText('Nothing selected');

  // More menu holds export/clear; Esc closes it.
  await panel.click('#planMore summary');
  await expect(panel.locator('#clearPlan')).toBeVisible();
  await panel.keyboard.press('Escape');
  await expect(panel.locator('#clearPlan')).toBeHidden();

  await panel.click('#planMore summary');
  await panel.click('#clearPlan');
  await expect(panel.locator('#planActions')).toBeHidden();
});
