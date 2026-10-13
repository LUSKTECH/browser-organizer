// First-run wizard: where the extension lives → helper → choose AI → set up → test → done.
// Logic that doesn't need chrome.* lives in ../lib/onboarding.js (unit-tested).
import { $, send, setSettings } from '../sidepanel/dom.js';
import { getSettings } from '../lib/storage.js';
import { setSecret, hasSecret } from '../lib/secret-store.js';
import { healthMessage, installCommand } from '../sidepanel/viewmodel.js';
import {
  STEPS, PROBE_ADAPTERS, backendInfo, classifyHostError, isHostReachable, recommendAdapter,
  normalizeState, clampStep, pinHint, canOfferInstaller,
} from '../lib/onboarding.js';

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const kid of kids) node.append(kid);
  return node;
}

// "Run `claude` once" → text with <code> around the backticked parts (no innerHTML).
function withCode(text) {
  const frag = document.createDocumentFragment();
  String(text).split('`').forEach((part, i) => frag.append(i % 2 ? el('code', {}, part) : part));
  return frag;
}

let state = normalizeState(null);
let probe = { results: {}, reachable: false };
let choice = null;
let windowId = null;
let nextEnabled = true;

async function saveState(patch) {
  state = { ...state, ...patch };
  await chrome.storage.local.set({ onboarding: state });
}

async function runProbe() {
  const res = await send({ cmd: 'probe' });
  const results = (res && res.results) || {};
  probe = { results, reachable: isHostReachable(results) };
  return probe;
}

function setNext(enabled) { nextEnabled = enabled; $('next').disabled = !enabled; }

async function openPanel(msgEl) {
  try {
    await chrome.sidePanel.open({ windowId });
    msgEl.textContent = 'The side panel opened on the right.';
  } catch {
    msgEl.textContent = 'Click the Browser Organizer icon in your toolbar to open the side panel.';
  }
}

// ---- steps --------------------------------------------------------------

const enter = {
  welcome() {
    $('pinHint').textContent = pinHint(navigator.userAgent);
    setNext(true);
  },

  async helper() {
    setNext(false);
    const status = $('helperStatus');
    status.className = '';
    status.textContent = 'Looking for the helper…';
    $('installCmd').textContent = installCommand(chrome.runtime.id);
    $('installerHint').hidden = !canOfferInstaller(chrome.runtime.id);
    await runProbe();
    const forbidden = Object.values(probe.results).some((r) => r && !r.hostVersion && classifyHostError(r.error) === 'forbidden');
    $('helperHelp').hidden = probe.reachable;
    $('helperForbidden').hidden = probe.reachable || !forbidden;
    if (probe.reachable) {
      const v = Object.values(probe.results).find((r) => r && r.hostVersion).hostVersion;
      status.className = 'ok';
      status.textContent = `Helper found (v${v}).`;
      setNext(true);
    } else {
      status.className = 'bad';
      status.textContent = 'The helper isn\'t connected yet.';
    }
  },

  async backend() {
    if (!Object.keys(probe.results).length) await runProbe();
    const s = await getSettings();
    const rec = recommendAdapter(probe.results);
    if (!choice) choice = probe.results[s.adapter] && probe.results[s.adapter].ready ? s.adapter : rec;
    const box = $('backendCards');
    for (const old of box.querySelectorAll('label')) old.remove();
    for (const a of PROBE_ADAPTERS) {
      const info = backendInfo(a);
      const ready = !!(probe.results[a] && probe.results[a].ready);
      const radio = el('input', { type: 'radio', name: 'backend', value: a, checked: a === choice });
      radio.addEventListener('change', () => { choice = a; });
      const title = el('span', { class: 'name' }, info.label);
      if (ready && a !== 'openai') title.append(el('span', { class: 'badge ready' }, 'Ready'));
      if (a === rec) title.append(el('span', { class: 'badge rec' }, 'Recommended'));
      box.append(el('label', { class: 'card' }, radio, el('span', {}, title, el('br'), withCode(info.blurb))));
    }
    setNext(true);
  },

  async setup() {
    const info = backendInfo(choice);
    $('setupTitle').textContent = `Set up ${info.label}`;
    const body = $('setupBody');
    body.replaceChildren();
    if (info.kind === 'api') {
      const s = await getSettings();
      const saved = await hasSecret('openaiApiKey');
      body.append(
        el('p', {}, 'Enter your API key. Leave the address and model blank for OpenAI\'s defaults. The key is stored encrypted in this browser and sent only to the address you enter.'),
        field('apiBase', 'API address (optional)', 'text', s.openaiBaseUrl || '', 'https://api.openai.com/v1'),
        field('apiModel', 'Model (optional)', 'text', s.openaiModel || '', ''),
        field('apiKey', 'API key', 'password', '', saved ? '•••••••• saved — leave blank to keep' : 'sk-…'),
        el('p', { id: 'setupMsg', class: 'bad', role: 'alert' }),
      );
      setNext(true);
      return;
    }
    const ready = !!(probe.results[choice] && probe.results[choice].ready);
    if (ready) {
      body.append(el('p', { class: 'ok' }, `${info.label} found (${probe.results[choice].version || 'ok'}).`),
        el('p', {}, 'Next we\'ll check that it\'s signed in.'));
      setNext(true);
      return;
    }
    const steps = el('ol');
    for (const line of info.setup) steps.append(el('li', {}, withCode(line)));
    const msg = el('p', { id: 'setupMsg', role: 'status' });
    const btn = el('button', { type: 'button', class: 'primary' }, 'Recheck');
    btn.addEventListener('click', async () => {
      msg.textContent = 'Checking…';
      await runProbe();
      if (probe.results[choice] && probe.results[choice].ready) await enter.setup();
      else msg.textContent = `Still can't find ${info.label}. Finish the steps above, then try again.`;
    });
    body.append(el('p', {}, `${info.label} wasn't found on this computer.`), steps, el('p', {}, btn), msg);
    setNext(false);
  },

  async test() {
    setNext(false);
    $('testResult').textContent = '';
    $('testHealth').textContent = 'Checking the connection…';
    const res = await send({ cmd: 'health' });
    const { ok, text } = healthMessage(res && res.health, chrome.runtime.id);
    $('testHealth').className = ok ? 'ok' : 'bad';
    $('testHealth').style.whiteSpace = 'pre-line';
    $('testHealth').textContent = text;
    setNext(ok);
  },

  async done() {
    if (!state.skipped) await saveState({ completed: true });
    $('doneTitle').textContent = state.skipped ? 'Setup skipped' : 'You\'re set';
    $('doneBody').textContent = state.skipped
      ? 'You can finish setup any time: open the side panel and choose "Set up…", or use "Run setup again" in Settings.'
      : 'Open the side panel from the toolbar icon, or press Ctrl+Shift+O to analyze your tabs. Every change waits for your approval, and you can undo it.';
  },
};

function field(id, label, type, value, placeholder) {
  const input = el('input', { id, type, value, placeholder, autocomplete: 'off' });
  return el('label', { class: 'field', htmlFor: id }, label, input);
}

// Runs when Next is pressed; returning false keeps the user on the step.
const before = {
  async backend() {
    await setSettings({ adapter: choice });
    return true;
  },
  async setup() {
    if (backendInfo(choice).kind !== 'api') return true;
    const msg = $('setupMsg');
    const key = $('apiKey').value.trim();
    if (!key && !(await hasSecret('openaiApiKey'))) { msg.textContent = 'Enter an API key to continue.'; return false; }
    if (key) { await setSecret('openaiApiKey', key); $('apiKey').value = ''; }
    await setSettings({ openaiBaseUrl: $('apiBase').value.trim(), openaiModel: $('apiModel').value.trim() });
    return true;
  },
};

// ---- navigation ---------------------------------------------------------

async function show(index) {
  state.step = clampStep(index);
  await saveState({ step: state.step });
  const name = STEPS[state.step];
  for (const sec of document.querySelectorAll('[data-step]')) sec.hidden = sec.dataset.step !== name;
  $('progress').textContent = `Step ${state.step + 1} of ${STEPS.length}`;
  $('back').disabled = state.step === 0;
  const last = name === 'done';
  $('next').hidden = last;
  $('skip').hidden = last;
  const heading = document.querySelector(`[data-step="${name}"] h2`);
  if (heading) { heading.tabIndex = -1; heading.focus(); }
  await enter[name]();
}

async function init() {
  const { onboarding } = await chrome.storage.local.get('onboarding');
  state = normalizeState(onboarding);
  windowId = (await chrome.windows.getCurrent()).id;
  $('openPanel').addEventListener('click', () => openPanel($('openPanelMsg')));
  $('analyze').addEventListener('click', () => openPanel($('analyzeMsg')));
  $('copyCmd').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(installCommand(chrome.runtime.id)); $('helperStatus').textContent = 'Command copied.'; }
    catch { $('helperStatus').textContent = 'Copy failed. Select the command and copy it by hand.'; }
  });
  $('helperRecheck').addEventListener('click', () => enter.helper());
  $('testSignIn').addEventListener('click', async () => {
    const out = $('testResult');
    out.className = '';
    out.textContent = 'Asking your AI…';
    $('testSignIn').disabled = true;
    const res = await send({ cmd: 'testPrompt' });
    $('testSignIn').disabled = false;
    if (res && res.ok) { out.className = 'ok'; out.textContent = `It answered: "${res.reply.trim() || '(empty reply)'}". Sign-in works.`; }
    else { out.className = 'bad'; out.textContent = `That didn't work: ${(res && res.error) || 'no response'}`; }
  });
  $('back').addEventListener('click', () => show(state.step - 1));
  $('next').addEventListener('click', async () => {
    if (!nextEnabled) return;
    const hook = before[STEPS[state.step]];
    if (hook && !(await hook())) return;
    await show(state.step + 1);
  });
  $('skip').addEventListener('click', async () => {
    await saveState({ skipped: true });
    await show(STEPS.length - 1);
  });
  // Reopening a finished or skipped wizard (Set up… / Run setup again) starts over; otherwise resume.
  if (state.completed || state.skipped) await saveState({ step: 0, completed: false, skipped: false });
  await show(state.step);
}

init().catch((err) => console.error('[organizer] wizard failed to start:', err));
