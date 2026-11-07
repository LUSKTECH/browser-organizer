// "Grouping rules" editor: an ordered list of rules (first match wins) saved through the
// service worker, which validates them. Match counts come from one listOpenTabs call.
import { $, request, setStatus } from './dom.js';
import { TAB_GROUP_COLORS } from '../lib/colors.js';
import { RULE_KINDS, matchRule } from '../lib/rules.js';

const KIND_LABELS = { domain: 'Domain', urlPrefix: 'URL starts with', titleContains: 'Title contains' };
let rules = [];
let openTabs = [];

const newRule = () => ({ id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: '', match: { kind: 'domain', value: '' }, group: { name: '', color: 'grey' } });

function textInput(label, value, placeholder, onInput) {
  const el = document.createElement('input');
  el.type = 'text';
  el.value = value;
  el.placeholder = placeholder;
  el.setAttribute('aria-label', label);
  el.addEventListener('input', () => onInput(el.value));
  return el;
}

function select(label, options, value, onChange) {
  const el = document.createElement('select');
  el.setAttribute('aria-label', label);
  for (const [v, text] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = text;
    el.appendChild(o);
  }
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

function button(text, label, onClick, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.setAttribute('aria-label', label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function countText(rule) {
  const n = rule.match.value.trim() ? openTabs.filter((t) => matchRule(rule, t)).length : 0;
  return `matches ${n} open tab${n === 1 ? '' : 's'}`;
}

function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= rules.length) return;
  [rules[i], rules[j]] = [rules[j], rules[i]];
  draw();
}

function ruleRow(rule, i) {
  const li = document.createElement('li');
  li.className = 'ruleRow';
  const n = `Rule ${i + 1}`;
  const count = document.createElement('span');
  count.className = 'ruleCount';
  count.textContent = countText(rule);
  const refresh = () => { count.textContent = countText(rule); };
  li.append(
    textInput(`${n} name`, rule.name, 'Rule name', (v) => { rule.name = v; }),
    select(`${n} match type`, RULE_KINDS.map((k) => [k, KIND_LABELS[k]]), rule.match.kind, (v) => { rule.match.kind = v; refresh(); }),
    textInput(`${n} match value`, rule.match.value, 'e.g. github.com', (v) => { rule.match.value = v; refresh(); }),
    textInput(`${n} group name`, rule.group.name, 'Group name', (v) => { rule.group.name = v; }),
    select(`${n} group color`, TAB_GROUP_COLORS.map((c) => [c, c]), rule.group.color, (v) => { rule.group.color = v; }),
  );
  const btns = document.createElement('div');
  btns.className = 'ruleBtns';
  btns.append(
    count,
    button('Up', `Move ${n} up`, () => move(i, -1), i === 0),
    button('Down', `Move ${n} down`, () => move(i, 1), i === rules.length - 1),
    button('Delete', `Delete ${n}`, () => { rules.splice(i, 1); draw(); }),
  );
  li.appendChild(btns);
  return li;
}

function draw() {
  const list = $('rulesList');
  list.textContent = '';
  if (!rules.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = 'No rules yet.';
    list.appendChild(li);
  }
  rules.forEach((r, i) => list.appendChild(ruleRow(r, i)));
}

async function load() {
  try {
    rules = (await request({ cmd: 'getRules' })).rules;
    openTabs = (await request({ cmd: 'listOpenTabs' })).tabs || [];
  } catch (err) { setStatus(`Could not load rules: ${err.message}`); }
  draw();
}

async function save() {
  try {
    rules = (await request({ cmd: 'setRules', rules })).rules;
    draw();
    setStatus(`Saved ${rules.length} rule${rules.length === 1 ? '' : 's'}.`);
  } catch (err) { setStatus(`Rules not saved: ${err.message}`); }
}

export function initRulesView() {
  $('rulesPanel').addEventListener('toggle', () => { if ($('rulesPanel').open) load(); });
  $('addRule').addEventListener('click', () => { rules.push(newRule()); draw(); });
  $('saveRules').addEventListener('click', save);
}
