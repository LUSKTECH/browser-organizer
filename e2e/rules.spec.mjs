import { test, expect, send, queryTabs, queryGroups } from './fixtures.mjs';

// Grouping rules: "Apply rules" groups matching tabs with no AI, can join an existing group, and
// setRules rejects oversized lists. The fixture server is 127.0.0.1; `localhost` is the "other" host.
test.describe.configure({ mode: 'serial' });

const devRule = (name = 'Local dev') => ({ id: 'dev', name, match: { kind: 'domain', value: '127.0.0.1' }, group: { name, color: 'green' } });

async function openTabs(context, server) {
  const other = server.replace('127.0.0.1', 'localhost');
  for (const u of [`${server}/react/docs`, `${server}/news/sports`, `${other}/other/page`]) await (await context.newPage()).goto(u);
  return { other };
}

async function planFromApplyRules(panel) {
  await panel.reload({ waitUntil: 'domcontentloaded' });
  await expect(panel.locator('#applyRulesBtn')).toBeEnabled();
  await panel.click('#applyRulesBtn');
  await expect.poll(async () => (await send(panel, { cmd: 'getPlan' })).items.length, { timeout: 20000 }).toBeGreaterThan(0);
  return (await send(panel, { cmd: 'getPlan' })).items;
}

test('Apply rules groups the matching tabs under the rule group and leaves the others alone', async ({ context, server, panel }) => {
  expect((await send(panel, { cmd: 'setRules', rules: [devRule()] })).ok).toBe(true);
  const { other } = await openTabs(context, server);

  const plan = await planFromApplyRules(panel);
  expect(plan).toHaveLength(1);
  expect(plan[0].reason).toBe('Rule "Local dev"');
  expect((await send(panel, { cmd: 'apply', itemIds: plan.map((i) => i.itemId) })).applied).toHaveLength(1);

  const tabs = await queryTabs(panel);
  const groups = await queryGroups(panel);
  const group = groups.find((g) => g.title === 'Local dev');
  expect(group).toBeTruthy();
  const inGroup = tabs.filter((t) => t.groupId === group.id).map((t) => t.url).sort();
  expect(inGroup).toEqual([`${server}/news/sports`, `${server}/react/docs`]);
  expect(tabs.find((t) => t.url === `${other}/other/page`).groupId).toBe(-1);
});

test('an existing group with the rule title gets the new tab, and no second group is created', async ({ context, server, panel }) => {
  await send(panel, { cmd: 'setRules', rules: [devRule('Pinned stuff')] });
  const first = await context.newPage();
  await first.goto(`${server}/react/docs`);
  const groupId = await panel.evaluate(async (u) => {
    const [t] = await chrome.tabs.query({ url: `${u}*` });
    const id = await chrome.tabs.group({ tabIds: [t.id] });
    await chrome.tabGroups.update(id, { title: 'pinned stuff', color: 'red' });
    return id;
  }, `${server}/react/docs`);
  await (await context.newPage()).goto(`${server}/news/sports`);
  const before = (await queryGroups(panel)).length;

  const plan = await planFromApplyRules(panel);
  expect(plan).toHaveLength(1);
  expect(plan[0].data.existingGroupId).toBe(groupId);
  await send(panel, { cmd: 'apply', itemIds: plan.map((i) => i.itemId) });

  const groups = await queryGroups(panel);
  expect(groups).toHaveLength(before);
  expect(groups.find((g) => g.id === groupId).color).toBe('red'); // title/color untouched
  const members = (await queryTabs(panel)).filter((t) => t.groupId === groupId);
  expect(members).toHaveLength(2);
});

test('saving 41 rules is rejected with a clear error', async ({ panel }) => {
  const rules = Array.from({ length: 41 }, (_, i) => ({ id: `r${i}`, name: `R${i}`, match: { kind: 'domain', value: `a${i}.example` }, group: { name: `G${i}`, color: 'blue' } }));
  const res = await send(panel, { cmd: 'setRules', rules });
  expect(res.ok).toBe(false);
  expect(res.error).toMatch(/Too many rules/);
  expect((await send(panel, { cmd: 'getRules' })).rules.length).toBeLessThan(41);
});

test('the Grouping rules editor adds and saves a rule, and shows a validation error', async ({ panel }) => {
  await panel.click('#rulesPanel summary');
  await panel.getByRole('button', { name: 'Add rule' }).click();
  await panel.getByLabel('Rule 1 name').fill('Docs');
  await panel.getByLabel('Rule 1 match type').selectOption('urlPrefix');
  await panel.getByLabel('Rule 1 match value').fill('https://developer.mozilla.org/');
  await panel.getByLabel('Rule 1 group name').fill('Reference');
  await panel.getByLabel('Rule 1 group color').selectOption('purple');
  await panel.getByRole('button', { name: 'Save rules' }).click();
  await expect.poll(async () => (await send(panel, { cmd: 'getRules' })).rules?.[0]).toMatchObject({
    name: 'Docs', match: { kind: 'urlPrefix', value: 'https://developer.mozilla.org/' }, group: { name: 'Reference', color: 'purple' },
  });

  // An empty match value is rejected and the reason reaches the status line.
  await panel.getByLabel('Rule 1 match value').fill('');
  await panel.getByRole('button', { name: 'Save rules' }).click();
  await expect(panel.locator('#status')).toContainText(/rule 1/i);
});
