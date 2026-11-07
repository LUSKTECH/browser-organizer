import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRule, firstMatch, validateRules, planRuleGroups, MAX_RULES } from '../extension/lib/rules.js';

const rule = (kind, value, extra = {}) => ({ id: extra.id || 'r1', name: extra.name || 'Dev', match: { kind, value }, group: { name: extra.group || 'Dev', color: 'blue' } });
const tab = (url, title = '', extra = {}) => ({ tabId: 1, windowId: 1, groupId: -1, url, title, ...extra });

const MATCH_TABLE = [
  ['domain', 'github.com', 'https://github.com/a', '', true],
  ['domain', 'github.com', 'https://gist.github.com/a', '', true],
  ['domain', 'github.com', 'https://GITHUB.com/a', '', true],
  ['domain', 'GitHub.com', 'https://github.com/a', '', true],
  ['domain', 'github.com', 'https://notgithub.com/a', '', false],
  ['domain', 'github.com', 'https://github.com.evil.io/', '', false],
  ['domain', 'https://github.com/some/path', 'https://gist.github.com/x', '', true],
  ['domain', 'github.com', 'not a url', '', false],
  ['urlPrefix', 'https://docs.example.com/guide', 'https://docs.example.com/guide/intro', '', true],
  ['urlPrefix', 'HTTPS://DOCS.example.com/guide', 'https://docs.example.com/GUIDE/x', '', true],
  ['urlPrefix', 'https://docs.example.com/guide', 'https://docs.example.com/other', '', false],
  ['titleContains', 'inbox', 'https://mail.example.com', 'Work INBOX (3)', true],
  ['titleContains', 'inbox', 'https://mail.example.com', 'Sent', false],
];
for (const [kind, value, url, title, want] of MATCH_TABLE) {
  test(`matchRule ${kind} "${value}" vs ${url} "${title}" -> ${want}`, () => {
    assert.equal(matchRule(rule(kind, value), tab(url, title)), want);
  });
}

test('firstMatch returns the first rule in list order', () => {
  const a = rule('domain', 'github.com', { id: 'a' });
  const b = rule('titleContains', 'repo', { id: 'b' });
  assert.equal(firstMatch([b, a], tab('https://github.com/x', 'my repo')).id, 'b');
  assert.equal(firstMatch([a, b], tab('https://github.com/x', 'my repo')).id, 'a');
  assert.equal(firstMatch([a], tab('https://other.com', '')), null);
});

const good = (over = {}) => ({ id: 'x', name: 'Dev', match: { kind: 'domain', value: 'github.com' }, group: { name: 'Dev', color: 'blue' }, ...over });

test('validateRules cleans rules, defaults color to grey and fills a missing id', () => {
  const out = validateRules([{ name: ' Dev ', match: { kind: 'domain', value: ' github.com ' }, group: { name: 'Code' } }]);
  assert.equal(out[0].name, 'Dev');
  assert.equal(out[0].match.value, 'github.com');
  assert.equal(out[0].group.color, 'grey');
  assert.ok(out[0].id);
});

test('validateRules enforces the count cap', () => {
  assert.equal(validateRules(Array.from({ length: MAX_RULES }, (_, i) => good({ id: `r${i}` }))).length, MAX_RULES);
  assert.throws(() => validateRules(Array.from({ length: MAX_RULES + 1 }, (_, i) => good({ id: `r${i}` }))), /Too many rules/);
});

test('validateRules rejects bad names, values, kinds and colors with a clear message', () => {
  assert.throws(() => validateRules('nope'), /list/);
  assert.throws(() => validateRules([good({ name: '' })]), /needs a name/);
  assert.throws(() => validateRules([good({ name: 'x'.repeat(61) })]), /name is longer than 60/);
  assert.throws(() => validateRules([good({ match: { kind: 'domain', value: '' } })]), /match value is empty/);
  assert.throws(() => validateRules([good({ match: { kind: 'domain', value: 'x'.repeat(201) } })]), /longer than 200/);
  assert.throws(() => validateRules([good({ match: { kind: 'regex', value: 'a' } })]), /unknown match type "regex"/);
  assert.throws(() => validateRules([good({ group: { name: 'G', color: 'mauve' } })]), /unknown color "mauve"/);
  assert.throws(() => validateRules([good({ group: { name: '', color: 'blue' } })]), /group name is empty/);
});

test('validateRules measures the 6000-byte budget in UTF-8 bytes, not characters', () => {
  // 3-byte characters: 40 rules x 60-char values stays under 200 chars but blows the byte budget.
  const heavy = (i) => good({ id: `r${i}`, name: '日'.repeat(40), match: { kind: 'titleContains', value: '本'.repeat(60) }, group: { name: '語'.repeat(40), color: 'blue' } });
  assert.throws(() => validateRules(Array.from({ length: 30 }, (_, i) => heavy(i))), /too large/);
  assert.equal(validateRules([heavy(0)]).length, 1);
});

test('planRuleGroups makes one item per rule and window', () => {
  const rules = [rule('domain', 'github.com', { id: 'dev', name: 'Dev', group: 'Code' })];
  const tabs = [
    tab('https://github.com/a', '', { tabId: 1, windowId: 1 }),
    tab('https://github.com/b', '', { tabId: 2, windowId: 1 }),
    tab('https://github.com/c', '', { tabId: 3, windowId: 2 }),
    tab('https://other.com', '', { tabId: 4, windowId: 1 }),
  ];
  const items = planRuleGroups(rules, tabs, []);
  assert.deepEqual(items.map((i) => i.itemId), ['rule-dev-w1', 'rule-dev-w2']);
  assert.deepEqual(items[0].data.tabIds, [1, 2]);
  assert.deepEqual(items[0].data.members.map((m) => m.tabId), [1, 2], 'members feed the panel row');
  assert.equal(items[0].data.groupName, 'Code');
  assert.equal(items[0].data.color, 'blue');
  assert.equal(items[0].data.windowId, 1);
  assert.equal(items[0].action, 'groupTabs');
  assert.equal(items[0].status, 'pending');
  assert.equal(items[0].reason, 'Rule "Dev"');
  assert.deepEqual(items[1].data.tabIds, [3]);
});

test('planRuleGroups skips tabs already in a group and yields nothing for zero matches', () => {
  const rules = [rule('domain', 'github.com', { id: 'dev' })];
  assert.deepEqual(planRuleGroups(rules, [tab('https://github.com/a', '', { groupId: 5 })], []), []);
  assert.deepEqual(planRuleGroups(rules, [tab('https://other.com')], []), []);
  assert.deepEqual(planRuleGroups([], [tab('https://github.com/a')], []), []);
});

test('planRuleGroups sends the first matching rule only', () => {
  const rules = [rule('domain', 'github.com', { id: 'a', group: 'A' }), rule('titleContains', 'x', { id: 'b', group: 'B' })];
  const items = planRuleGroups(rules, [tab('https://github.com/a', 'x')], []);
  assert.deepEqual(items.map((i) => i.itemId), ['rule-a-w1']);
});

test('planRuleGroups sets existingGroupId only for a same-window, same-title group (case-insensitive)', () => {
  const rules = [rule('domain', 'github.com', { id: 'dev', group: 'Code' })];
  const tabs = [tab('https://github.com/a', '', { tabId: 1, windowId: 1 }), tab('https://github.com/b', '', { tabId: 2, windowId: 2 })];
  const groups = [
    { id: 10, title: 'code', windowId: 1, color: 'red' },
    { id: 11, title: 'Code', windowId: 3, color: 'red' },
    { id: 12, title: 'Other', windowId: 2, color: 'red' },
  ];
  const items = planRuleGroups(rules, tabs, groups);
  assert.equal(items.find((i) => i.data.windowId === 1).data.existingGroupId, 10);
  assert.equal('existingGroupId' in items.find((i) => i.data.windowId === 2).data, false);
});
