import { test, expect, send, countTabsWithUrl } from './fixtures.mjs';

// Save/restore is local and deterministic (no CLI).
test.describe.configure({ mode: 'serial' });

test('saves the current window as a session and restores its tabs', async ({ context, server, panel }) => {
  const u1 = `${server}/react/docs`;
  const u2 = `${server}/news/tech`;
  await (await context.newPage()).goto(u1);
  await (await context.newPage()).goto(u2);
  expect(await countTabsWithUrl(panel, u1)).toBe(1);
  expect(await countTabsWithUrl(panel, u2)).toBe(1);

  // Save -> the window's http tabs are captured and closed.
  const saved = await send(panel, { cmd: 'saveSession', name: 'Work' });
  expect(saved.ok, saved.error).toBeTruthy();
  expect(saved.session.name).toBe('Work');
  const savedUrls = saved.session.tabs.map((t) => t.url);
  expect(savedUrls).toContain(u1);
  expect(savedUrls).toContain(u2);
  await expect.poll(() => countTabsWithUrl(panel, u1)).toBe(0);
  await expect.poll(() => countTabsWithUrl(panel, u2)).toBe(0);

  // The session is persisted and listable.
  const list = await send(panel, { cmd: 'listSessions' });
  expect(list.sessions.some((s) => s.sessionId === saved.session.sessionId)).toBeTruthy();

  // Restore -> the tabs come back (in a new window).
  const restored = await send(panel, { cmd: 'restoreSession', id: saved.session.sessionId });
  expect(restored.ok).toBeTruthy();
  await expect.poll(() => countTabsWithUrl(panel, u1)).toBe(1);
  await expect.poll(() => countTabsWithUrl(panel, u2)).toBe(1);
});
