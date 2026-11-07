import { TAB_GROUP_COLORS } from './colors.js';

// User-defined tab-grouping rules. Pure: no chrome.* access, so it is testable and the
// orchestrator decides what to feed it. First matching rule (list order) wins.
export const RULE_KINDS = ['domain', 'urlPrefix', 'titleContains'];
export const MAX_RULES = 40;
export const MAX_NAME = 60;
export const MAX_VALUE = 200;
export const MAX_RULES_BYTES = 6000;

function hostOf(value) {
  const v = String(value).trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) { try { return new URL(v).hostname.toLowerCase(); } catch { /* fall through */ } }
  return v.toLowerCase().replace(/^\.+/, '').replace(/[/?#].*$/, '');
}

function tabHost(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

export function matchRule(rule, tab) {
  const value = rule && rule.match && String(rule.match.value || '');
  if (!value) return false;
  switch (rule.match.kind) {
    case 'domain': {
      const want = hostOf(value);
      const host = tabHost(tab.url || '');
      return !!want && !!host && (host === want || host.endsWith(`.${want}`));
    }
    case 'urlPrefix': return String(tab.url || '').toLowerCase().startsWith(value.trim().toLowerCase());
    case 'titleContains': return String(tab.title || '').toLowerCase().includes(value.trim().toLowerCase());
    default: return false;
  }
}

export function firstMatch(rules, tab) {
  return (rules || []).find((r) => matchRule(r, tab)) || null;
}

function cleanRule(r, i) {
  const at = `Rule ${i + 1}`;
  if (!r || typeof r !== 'object') throw new Error(`${at} is not valid`);
  const name = String(r.name ?? '').trim();
  if (!name) throw new Error(`${at} needs a name`);
  if (name.length > MAX_NAME) throw new Error(`${at}: name is longer than ${MAX_NAME} characters`);
  const kind = r.match && r.match.kind;
  if (!RULE_KINDS.includes(kind)) throw new Error(`${at}: unknown match type "${kind}"`);
  const value = String((r.match && r.match.value) ?? '').trim();
  if (!value) throw new Error(`${at}: the match value is empty`);
  if (value.length > MAX_VALUE) throw new Error(`${at}: the match value is longer than ${MAX_VALUE} characters`);
  const groupName = String((r.group && r.group.name) ?? '').trim();
  if (!groupName) throw new Error(`${at}: the group name is empty`);
  if (groupName.length > MAX_NAME) throw new Error(`${at}: group name is longer than ${MAX_NAME} characters`);
  const color = (r.group && r.group.color) || 'grey';
  if (!TAB_GROUP_COLORS.includes(color)) throw new Error(`${at}: unknown color "${color}"`);
  const id = typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `r${i + 1}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, name, match: { kind, value }, group: { name: groupName, color } };
}

export function validateRules(rules) {
  if (!Array.isArray(rules)) throw new Error('Rules must be a list');
  if (rules.length > MAX_RULES) throw new Error(`Too many rules: the limit is ${MAX_RULES}`);
  const clean = rules.map(cleanRule);
  const bytes = new TextEncoder().encode(JSON.stringify(clean)).length;
  if (bytes > MAX_RULES_BYTES) throw new Error(`Rules are too large to sync (${bytes} of ${MAX_RULES_BYTES} bytes). Shorten some names or values`);
  return clean;
}

// One groupTabs item per (rule, window): Chrome groups cannot span windows. Only ungrouped tabs.
export function planRuleGroups(rules, tabs, existingGroups = []) {
  const buckets = new Map(); // `${ruleId}|${windowId}` -> { rule, windowId, tabIds }
  for (const t of tabs) {
    if ((t.groupId ?? -1) !== -1) continue;
    const rule = firstMatch(rules, t);
    if (!rule) continue;
    const key = `${rule.id}|${t.windowId}`;
    if (!buckets.has(key)) buckets.set(key, { rule, windowId: t.windowId, tabIds: [], members: [] });
    buckets.get(key).tabIds.push(t.tabId);
    buckets.get(key).members.push({ tabId: t.tabId, title: t.title, url: t.url });
  }
  return [...buckets.values()].map(({ rule, windowId, tabIds, members }) => {
    const title = rule.group.name.toLowerCase();
    const existing = existingGroups.find((g) => g.windowId === windowId && String(g.title || '').toLowerCase() === title);
    const data = { tabIds, groupName: rule.group.name, color: rule.group.color, windowId, members };
    if (existing) data.existingGroupId = existing.id;
    return { itemId: `rule-${rule.id}-w${windowId}`, action: 'groupTabs', status: 'pending', reason: `Rule "${rule.name}"`, data };
  });
}
