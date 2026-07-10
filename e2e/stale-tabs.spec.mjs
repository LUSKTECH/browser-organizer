import { test, expect, send, queryTabs, runFeature } from './fixtures.mjs';

// Stale-tab detection sends idle candidates to the Claude CLI: tolerant + skippable.
test.describe.configure({ mode: 'serial' });

test('flags a long-idle tab for closing or suspending via the Claude CLI', async ({ context, server, panel }) => {
  test.skip(process.env.BORG_SKIP_CLI === '1', 'CLI tests disabled via BORG_SKIP_CLI');
  test.setTimeout(150000);

  const staleUrl = `${server}/news/sports`;
  await (await context.newPage()).goto(staleUrl);
  await (await context.newPage()).goto(`${server}/react/docs`); // a fresh tab

  // Seed the sports tab's activity to ~40 days ago so it exceeds the 14-day threshold.
  const staleTab = (await queryTabs(panel)).find((t) => t.url === staleUrl);
  expect(staleTab).toBeTruthy();
  const fortyDaysAgo = Date.now() - 40 * 86400000;
  await panel.evaluate(({ id, ts }) => new Promise((r) => {
    chrome.storage.local.get('tabActivity', ({ tabActivity = {} }) => {
      tabActivity[id] = { firstSeen: ts, lastActive: ts };
      chrome.storage.local.set({ tabActivity }, r);
    });
  }), { id: staleTab.id, ts: fortyDaysAgo });

  const run = await runFeature(panel, 'staleTabs');
  expect(run.ok, `run error: ${run.error}`).toBeTruthy();

  const plan = (await send(panel, { cmd: 'getPlan' })).items;
  const flagged = plan.find((i) => (i.action === 'closeTab' || i.action === 'discardTab') && i.data.tabId === staleTab.id);
  expect(flagged, 'the long-idle tab should be proposed for close/suspend').toBeTruthy();
});
