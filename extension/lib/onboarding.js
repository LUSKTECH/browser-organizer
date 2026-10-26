// Pure logic for the first-run wizard (welcome/welcome.js drives the UI). Kept free of
// chrome.* so it is unit-testable in node.

export const STEPS = ['welcome', 'helper', 'backend', 'setup', 'test', 'done'];

// The one prompt the sign-in test sends: constant, no tab titles/URLs.
export const TEST_PROMPT = 'Reply with OK';

// The ID the prebuilt per-OS installers register (Web Store item / manifest `key`).
export const PINNED_EXTENSION_ID = 'klpoodibgjgibiiadnhddnnbpgckajkl';

// Probe order doubles as the recommendation order.
export const PROBE_ADAPTERS = ['claude', 'codex', 'copilot', 'kiro', 'antigravity', 'ollama', 'openai'];

const BACKENDS = {
  claude: {
    label: 'Claude Code', kind: 'cli',
    blurb: 'Uses your Claude subscription through the Claude Code CLI.',
    setup: ['Install Claude Code so that `claude` is on your PATH.', 'Run `claude` once in a terminal and sign in.'],
  },
  codex: {
    label: 'Codex CLI', kind: 'cli',
    blurb: 'Uses your OpenAI account through the Codex CLI.',
    setup: ['Install the Codex CLI so that `codex` is on your PATH.', 'Run `codex` once in a terminal and sign in with ChatGPT (or set OPENAI_API_KEY).'],
  },
  copilot: {
    label: 'GitHub Copilot CLI', kind: 'cli',
    blurb: 'Uses your GitHub Copilot subscription.',
    setup: ['Install the Copilot CLI so that `copilot` is on your PATH.', 'Sign in with an existing `gh` login, or set COPILOT_GITHUB_TOKEN / GH_TOKEN.'],
  },
  kiro: {
    label: 'Kiro CLI', kind: 'cli',
    blurb: 'Uses your Kiro account through the Kiro CLI.',
    setup: ['Install the Kiro CLI so that `kiro-cli` is on your PATH.', 'Set KIRO_API_KEY (Kiro Pro and up).'],
  },
  antigravity: {
    label: 'Antigravity CLI', kind: 'cli',
    blurb: 'Uses your Google account through the Antigravity CLI (`agy`).',
    setup: ['Install the Antigravity CLI so that `agy` is on your PATH.', 'Run `agy` once in a terminal and sign in (or set GEMINI_API_KEY / ANTIGRAVITY_API_KEY).'],
  },
  ollama: {
    label: 'Ollama (local)', kind: 'ollama',
    blurb: 'Runs a model on your own computer. Free, private, slower.',
    setup: ['Install Ollama from https://ollama.com.', 'Download a model: `ollama pull llama3.2`.'],
  },
  openai: {
    label: 'OpenAI-compatible API', kind: 'api',
    blurb: 'Nothing to install. Use an API key from OpenAI or any compatible service.',
    setup: [],
  },
};

export function backendInfo(adapter) {
  return BACKENDS[adapter] || { label: String(adapter), kind: 'cli', blurb: '', setup: [] };
}

// Chrome words these differently; only a native-messaging failure means the helper side is the
// problem. "other" is a reachable helper reporting its own error.
export function isNativeHostError(err) {
  const e = String(err || '');
  return e === '' || /native (messaging )?host|specified native/i.test(e);
}

export function classifyHostError(err) {
  const e = String(err || '');
  if (/forbidden/i.test(e)) return 'forbidden';
  if (isNativeHostError(e)) return 'missing';
  return 'other';
}

// `results` is { [adapter]: { ready, version?, error?, hostVersion? } } from the probe.
// The host stamps hostVersion on every reply, so any reply proves it is reachable.
export function isHostReachable(results) {
  return Object.values(results || {}).some((r) => r && r.hostVersion);
}

// First ready backend in probe order; else the one that needs nothing installed.
export function recommendAdapter(results) {
  for (const a of PROBE_ADAPTERS) if (a !== 'openai' && results && results[a] && results[a].ready) return a;
  if (results && results.openai && results.openai.ready) return 'openai';
  return 'openai';
}

export function clampStep(n) {
  const i = Number.isInteger(n) ? n : 0;
  return Math.min(Math.max(i, 0), STEPS.length - 1);
}

export function normalizeState(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { version: 1, completed: r.completed === true, skipped: r.skipped === true, step: clampStep(r.step) };
}

export function pinHint(userAgent) {
  const edge = /\bEdg\//.test(String(userAgent || ''));
  return edge
    ? 'Click the puzzle-piece Extensions button in the toolbar, then the eye icon next to Browser Organizer ("Show in toolbar").'
    : 'Click the puzzle-piece Extensions button in the toolbar, then the pin next to Browser Organizer.';
}

export function canOfferInstaller(extensionId) {
  return extensionId === PINNED_EXTENSION_ID;
}
