import { test, expect, send, countTabsWithUrl } from './fixtures.mjs';

// The "Remove duplicates" button runs only duplicate tabs + duplicate bookmarks (no AI).
test.describe.configure({ mode: 'serial' });

test('Remove duplicates proposes the duplicate tab and bookmark, and applying removes them', async ({ context, server, panel }) => {
  const dup = `${server}/react/docs`;
  await (await context.newPage()).goto(dup);
  await (await context.newPage()).goto(dup);
  await (await context.newPage()).goto(`${server}/news/sports`);
  await panel.evaluate(async (u) => {
    const [other] = await chrome.bookmarks.getTree().then((t) => t[0].children.filter((c) => c.id === '2' || c.title === 'Other bookmarks'));
    await chrome.bookmarks.create({ parentId: other.id, title: 'Docs', url: u });
    await chrome.bookmarks.create({ parentId: other.id, title: 'Docs again', url: u });
  }, dup);
  await panel.reload({ waitUntil: 'domcontentloaded' });

  await expect(panel.locator('#removeDupes')).toBeEnabled();
  await panel.click('#removeDupes');

  await expect.poll(async () => (await send(panel, { cmd: 'getPlan' })).items.length, { timeout: 20000 }).toBeGreaterThan(1);
  const plan = (await send(panel, { cmd: 'getPlan' })).items;
  const tabCloses = plan.filter((i) => i.action === 'closeTab' && i.data.url === dup);
  const bmDeletes = plan.filter((i) => i.action === 'deleteBookmark' && i.data.url === dup);
  expect(tabCloses).toHaveLength(1);
  expect(bmDeletes).toHaveLength(1);
  // Nothing outside duplicates: no stale/dead deletions, no grouping, no AI-driven items.
  expect(plan).toHaveLength(2);
  expect(plan.every((i) => i.action === 'closeTab' || (i.action === 'deleteBookmark' && i.category === 'duplicate'))).toBe(true);

  const applied = await send(panel, { cmd: 'apply', itemIds: [...tabCloses, ...bmDeletes].map((i) => i.itemId) });
  expect(applied.applied).toHaveLength(2);
  await expect.poll(() => countTabsWithUrl(panel, dup)).toBe(1);
  // The duplicate bookmark is really gone too: exactly one copy remains.
  await expect.poll(() => panel.evaluate(async (u) => (await chrome.bookmarks.search({ url: u })).length, dup)).toBe(1);
});
