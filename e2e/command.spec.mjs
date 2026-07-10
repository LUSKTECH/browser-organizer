import { test, expect, send } from './fixtures.mjs';

// Natural-language commands run through the Claude CLI: tolerant + skippable.
test.describe.configure({ mode: 'serial' });

test('a natural-language command returns an actionable plan via the Claude CLI', async ({ context, server, panel }) => {
  test.skip(process.env.BORG_SKIP_CLI === '1', 'CLI tests disabled via BORG_SKIP_CLI');
  test.setTimeout(150000);

  for (const p of ['/react/docs', '/react/hooks', '/news/politics', '/news/sports']) {
    await (await context.newPage()).goto(`${server}${p}`);
  }

  const res = await send(panel, { cmd: 'command', instruction: 'Group all the React tabs together into one group.' });
  expect(res.ok, `command error: ${res.error}`).toBeTruthy();
  expect(Array.isArray(res.items)).toBeTruthy();
  expect(res.items.length, 'the model should propose at least one action').toBeGreaterThan(0);
  // An explicit grouping instruction should yield a groupTabs action.
  expect(res.items.some((i) => i.action === 'groupTabs')).toBeTruthy();
});
