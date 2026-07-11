import { test, expect, countTabsWithUrl } from './fixtures.mjs';

// Direct tab search + bulk-close (no AI) — the top product gap. Deterministic.
test.describe.configure({ mode: 'serial' });

test('open-tabs panel filters, bulk-closes selected, and undo restores', async ({ context, server, panel }) => {
  const u1 = `${server}/react/docs`;
  const u2 = `${server}/react/hooks`;
  const u3 = `${server}/news/sports`;
  await (await context.newPage()).goto(u1);
  await (await context.newPage()).goto(u2);
  await (await context.newPage()).goto(u3);
  await panel.reload({ waitUntil: 'domcontentloaded' });

  await panel.click('#tabsPanel summary');           // opens -> renders the tab list
  await panel.fill('#tabFilter', 'react');           // live filter
  await expect(panel.locator('#tabCount')).toContainText(/2 of 3/);

  const boxes = panel.locator('#tabList li input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await panel.click('#closeTabsBtn');

  await expect.poll(() => countTabsWithUrl(panel, u1)).toBe(0);
  await expect.poll(() => countTabsWithUrl(panel, u2)).toBe(0);
  expect(await countTabsWithUrl(panel, u3)).toBe(1);  // non-matching tab untouched

  await expect(panel.locator('#undoToast')).toBeVisible();
  await panel.click('#undoToast button');
  await expect.poll(() => countTabsWithUrl(panel, u1)).toBe(1); // reopened
});
