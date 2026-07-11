// OpenAI-compatible Chat Completions adapter (`openai`).
//
// Unlike the CLI adapters this one talks HTTP from the native host — but it keeps
// the exact same security invariant: the API key, base URL, and model are all
// resolved HOST-SIDE from environment variables (set by the operator/installer),
// never from an extension message. A single base_url makes this work against
// OpenAI, OpenRouter, Groq, Together, LM Studio, vLLM, and any other endpoint
// that speaks the /chat/completions shape.
//
//   BROWSER_ORGANIZER_OPENAI_API_KEY   required — bearer token (host env only)
//   BROWSER_ORGANIZER_OPENAI_BASE_URL  default https://api.openai.com/v1
//   BROWSER_ORGANIZER_OPENAI_MODEL     default gpt-4o-mini
//
// Returns the assistant message text raw; the dispatcher extracts the JSON the
// prompt asked for (same lenient path as the CLI adapters).

const KEY_VAR = 'BROWSER_ORGANIZER_OPENAI_API_KEY';
const BASE_VAR = 'BROWSER_ORGANIZER_OPENAI_BASE_URL';
const MODEL_VAR = 'BROWSER_ORGANIZER_OPENAI_MODEL';
const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT = 120000;
const HEALTH_TIMEOUT = 10000;

export function resolveKey() { return process.env[KEY_VAR] || ''; }
export function resolveBase() { return (process.env[BASE_VAR] || DEFAULT_BASE).replace(/\/+$/, ''); }
export function resolveModel() { return process.env[MODEL_VAR] || DEFAULT_MODEL; }

function authHeaders(key) {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function safeText(res) {
  try { return await res.text(); } catch { return ''; }
}

// fetch with an AbortController timeout. fetchFn is injectable for tests.
async function fetchWithTimeout(fetchFn, url, options, timeoutMs) {
  if (typeof fetchFn !== 'function') throw new Error('global fetch unavailable — the native host needs Node 18+');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error(`OpenAI API timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const openaiAdapter = {
  name: 'openai',
  async run(prompt, opts = {}) {
    const key = resolveKey();
    if (!key) throw new Error(`OpenAI API key not set — set ${KEY_VAR} in the helper app's environment`);
    const fetchFn = opts.fetchFn || globalThis.fetch;
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT;
    const body = JSON.stringify({
      model: resolveModel(),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0, // deterministic-ish: we want strict JSON, not creativity
    });
    const res = await fetchWithTimeout(fetchFn, `${resolveBase()}/chat/completions`, { method: 'POST', headers: authHeaders(key), body }, timeoutMs);
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await safeText(res)).slice(0, 200)}`);
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== 'string') throw new Error('OpenAI API returned no message content');
    return content.trim();
  },
  async health(opts = {}) {
    const key = resolveKey();
    if (!key) throw new Error(`OpenAI API key not set — set ${KEY_VAR} in the helper app's environment`);
    const fetchFn = opts.fetchFn || globalThis.fetch;
    const res = await fetchWithTimeout(fetchFn, `${resolveBase()}/models`, { method: 'GET', headers: authHeaders(key) }, HEALTH_TIMEOUT);
    if (!res.ok) throw new Error(`OpenAI API ${res.status}`);
    return { version: `openai-compatible (${resolveModel()})` };
  },
};
