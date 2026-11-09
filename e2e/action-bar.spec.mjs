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

test('the selection never includes rows hidden by the filter', async ({ panel }) => {
  await seed(panel, 3);
  await panel.reload({ waitUntil: 'domcontentloaded' });
  await expect(panel.locator('#plan .item')).toHaveCount(3);
  await panel.click('#selectAll');
  await expect(panel.locator('#planSelCount')).toHaveText('3 selected');
  await panel.fill('#planFilter', 'Tab 1');
  await expect(panel.locator('#plan .item')).toHaveCount(1);
  await expect(panel.locator('#planSelCount')).toHaveText('1 selected');
  await expect(panel.locator('#approveSelected')).toHaveText('Apply selected (1)');
});

test('"Never suggest this" on a selected row drops it from the selection', async ({ panel }) => {
  await seed(panel, 2);
  await panel.reload({ waitUntil: 'domcontentloaded' });
  const first = panel.locator('#plan .item').first();
  await first.locator('input[type="checkbox"]').check();
  await expect(panel.locator('#planSelCount')).toHaveText('1 selected');
  await first.getByRole('button', { name: 'Never suggest this' }).click();
  await expect(panel.locator('#plan .item')).toHaveCount(1);
  await expect(panel.locator('#planSelCount')).toHaveText('Nothing selected');
  await expect(panel.locator('#approveSelected')).toBeDisabled();
});

test('More menu: above the toast while open, closes on tab-out, focus returns sensibly', async ({ panel }) => {
  await seed(panel, 2);
  await panel.reload({ waitUntil: 'domcontentloaded' });
  const z = () => panel.evaluate(() => window.getComputedStyle(document.querySelector('#planActions')).zIndex);
  expect(await z()).toBe('10');
  await panel.click('#planMore summary');
  expect(await z()).toBe('40');
  await expect(panel.locator('#planSelCount')).not.toHaveAttribute('aria-live');
  await expect(panel.locator('#planMore [role="menu"], #planMore [role="menuitem"]')).toHaveCount(0);

  // Tabbing past the last menu button closes the menu.
  await panel.focus('#clearPlan');
  await panel.keyboard.press('Tab');
  await expect(panel.locator('#planMore')).not.toHaveAttribute('open');
  expect(await z()).toBe('10');

  // Keyboard-choosing Export returns focus to the More summary.
  await panel.focus('#planMore summary');
  await panel.keyboard.press('Enter');
  await panel.focus('#exportMarkdown');
  await panel.keyboard.press('Enter');
  await expect(panel.locator('#planMore summary')).toBeFocused();

  // Clear hides the bar, so focus goes to Analyze, or to Remove duplicates while Analyze is
  // disabled (no AI connected, as on CI).
  await panel.focus('#planMore summary');
  await panel.keyboard.press('Enter');
  await panel.focus('#clearPlan');
  await panel.keyboard.press('Enter');
  await expect(panel.locator('#planActions')).toBeHidden();
  const expected = (await panel.locator('#run').isDisabled()) ? '#removeDupes' : '#run';
  await expect(panel.locator(expected)).toBeFocused();
});

test('after Clear list, focus lands on Remove duplicates when Analyze is disabled', async ({ panel }) => {
  await seed(panel, 3);
  await panel.reload({ waitUntil: 'domcontentloaded' });
  await expect(panel.locator('#plan .item')).toHaveCount(3);
  // Simulate "no AI connected" (the health check disables Analyze). Wait for the panel's own health
  // check to finish first, or it re-enables the button afterwards.
  await expect(panel.locator('#health')).not.toBeEmpty();
  await panel.evaluate(() => { document.getElementById('run').disabled = true; });
  await panel.click('#planMore summary');
  await panel.click('#clearPlan');
  await expect(panel.locator('#planActions')).toBeHidden();
  await expect(panel.locator('#removeDupes')).toBeFocused();
});
