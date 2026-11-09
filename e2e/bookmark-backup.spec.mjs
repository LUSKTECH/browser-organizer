import { test, expect, send, runFeature, createBookmark } from './fixtures.mjs';

// A snapshot is taken automatically before an apply that deletes bookmarks (not for tab-only
// batches), can be exported as bookmarks.html, and restores into a new folder.
test.describe.configure({ mode: 'serial' });

const OTHER = '2';

test('applying a bookmark delete takes a backup that can be exported and restored', async ({ panel }) => {
  const url = 'https://backup.example/page';
  await createBookmark(panel, { parentId: OTHER, title: 'Original', url });
  await createBookmark(panel, { parentId: OTHER, title: 'Copy', url });
  expect((await send(panel, { cmd: 'listBackups' })).backups).toHaveLength(0);

  const run = await runFeature(panel, 'cleanBookmarks');
  expect(run.ok, run.error).toBeTruthy();
  const plan = (await send(panel, { cmd: 'getPlan' })).items;
  const del = plan.filter((i) => i.action === 'deleteBookmark' && i.data.url === url);
  expect(del).toHaveLength(1);

  const applied = await send(panel, { cmd: 'apply', itemIds: del.map((i) => i.itemId) });
  expect(applied.applied).toHaveLength(1);
  expect(applied.backupError).toBeUndefined();

  const { backups } = await send(panel, { cmd: 'listBackups' });
  expect(backups).toHaveLength(1);
  // The snapshot is from BEFORE the delete: it still has both copies.
  const html = await send(panel, { cmd: 'getBackup', id: backups[0].id, format: 'html' });
  expect(html.ok).toBeTruthy();
  expect(html.name).toMatch(/^browser-organizer-backup-\d{4}-\d{2}-\d{2}\.html$/);
  expect(html.text.split(`HREF="${url}"`).length - 1).toBe(2);

  // Restore adds a "Restored …" folder and leaves everything else alone.
  const restored = await send(panel, { cmd: 'restoreBackup', id: backups[0].id });
  expect(restored.ok, restored.error).toBeTruthy();
  const found = await panel.evaluate(async (u) => {
    const folder = (await chrome.bookmarks.search({})).find((n) => !n.url && n.title.startsWith('Restored '));
    const hits = (await chrome.bookmarks.search({ url: u })).length;
    return { folder: !!folder, hits };
  }, url);
  expect(found.folder).toBe(true);
  expect(found.hits).toBe(3); // 1 kept + 2 restored copies
});

test('a tab-only apply takes no backup', async ({ context, server, panel }) => {
  const dup = `${server}/react/docs`;
  await (await context.newPage()).goto(dup);
  await (await context.newPage()).goto(dup);
  const run = await runFeature(panel, 'dupeTabs');
  expect(run.ok, run.error).toBeTruthy();
  const items = (await send(panel, { cmd: 'getPlan' })).items.filter((i) => i.action === 'closeTab');
  expect(items.length).toBeGreaterThan(0);
  const applied = await send(panel, { cmd: 'apply', itemIds: items.map((i) => i.itemId) });
  expect(applied.ok, applied.error).toBeTruthy();
  expect(applied.applied.length).toBeGreaterThan(0); // the tabs really closed, so "no backup" is meaningful
  expect((await send(panel, { cmd: 'listBackups' })).backups).toHaveLength(0);
});

test('when storage is nearly full the backup is skipped with a warning and the run still applies', async ({ panel }) => {
  const url = 'https://full.example/page';
  await createBookmark(panel, { parentId: OTHER, title: 'A', url });
  await createBookmark(panel, { parentId: OTHER, title: 'B', url });
  const run = await runFeature(panel, 'cleanBookmarks');
  expect(run.ok, run.error).toBeTruthy();
  const del = (await send(panel, { cmd: 'getPlan' })).items.filter((i) => i.action === 'deleteBookmark' && i.data.url === url);
  expect(del).toHaveLength(1);

  // Leave well under the reserve free in storage.local.
  await panel.evaluate(async () => {
    const used = await chrome.storage.local.getBytesInUse(null);
    await chrome.storage.local.set({ filler: 'x'.repeat(chrome.storage.local.QUOTA_BYTES - used - 400000) });
  });
  try {
    const applied = await send(panel, { cmd: 'apply', itemIds: del.map((i) => i.itemId) });
    expect(applied.ok, applied.error).toBeTruthy();
    expect(applied.applied).toHaveLength(1);           // the run itself still happened
    expect(applied.backupError).toMatch(/not enough free browser storage/);
    expect((await send(panel, { cmd: 'listBackups' })).backups).toHaveLength(0);
  } finally {
    await panel.evaluate(() => chrome.storage.local.remove('filler'));
  }
});

test('Back up now saves a snapshot and the button reports it', async ({ panel }) => {
  const before = (await send(panel, { cmd: 'listBackups' })).backups.length;
  await panel.click('#backupPanel summary');
  await panel.click('#backupNow');
  await expect(panel.locator('#status')).toContainText(/Backup saved \(\d+ bookmarks\)\./);
  expect((await send(panel, { cmd: 'listBackups' })).backups).toHaveLength(before + 1);
  await expect(panel.locator('#backupList li')).toHaveCount(before + 1);
});

test('Back up now shows the storage-full error', async ({ panel }) => {
  await panel.evaluate(async () => {
    const used = await chrome.storage.local.getBytesInUse(null);
    await chrome.storage.local.set({ filler: 'x'.repeat(chrome.storage.local.QUOTA_BYTES - used - 400000) });
  });
  try {
    const before = (await send(panel, { cmd: 'listBackups' })).backups.length;
    await panel.click('#backupPanel summary');
    await panel.click('#backupNow');
    await expect(panel.locator('#status')).toContainText(/not enough free browser storage/);
    expect((await send(panel, { cmd: 'listBackups' })).backups).toHaveLength(before);
  } finally {
    await panel.evaluate(() => chrome.storage.local.remove('filler'));
  }
});
