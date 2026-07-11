// Strip ANSI/CSI escape sequences (colors, cursor moves) some CLIs emit even
// when piped — their '[' would otherwise fool bracket extraction.
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;?]*[a-zA-Z]/g, '');
}

// Extract the *balanced* {…}/[…] block that starts at index `start`, respecting
// string literals/escapes so a brace inside a string doesn't end it early.
function extractBalancedAt(t, start) {
  const open = t[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return t.slice(start, i + 1); }
  }
  return null;
}

export function parseJsonBlock(text) {
  const t = stripAnsi(String(text)).trim();
  try { return JSON.parse(t); } catch { /* try harder */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch { /* fall through */ } }
  // Scan every { or [ and return the first balanced block that parses — handles
  // adapters that print prose (even prose with braces) before the JSON answer.
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{' && t[i] !== '[') continue;
    const block = extractBalancedAt(t, i);
    if (block) { try { return JSON.parse(block); } catch { /* keep scanning */ } }
  }
  throw new Error('No JSON found in model output');
}

const COLORS = new Set(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);

// Normalizers operate on an already-parsed array (reused by the command path
// without a JSON re-serialize round-trip); the parse* wrappers add text parsing.
export function normalizeGroups(groups) {
  if (!Array.isArray(groups)) throw new Error('Expected {"groups":[...]}');
  return groups
    .map((g) => ({
      name: String(g.name ?? 'Group').slice(0, 40),
      color: COLORS.has(g.color) ? g.color : 'grey',
      tabIds: (Array.isArray(g.tabIds) ? g.tabIds : []).map(Number).filter(Number.isInteger),
    }))
    .filter((g) => g.tabIds.length > 0);
}

export function normalizeImportant(important) {
  if (!Array.isArray(important)) throw new Error('Expected {"important":[...]}');
  return important
    .filter((i) => Number.isInteger(Number(i.tabId)))
    .map((i) => ({
      tabId: Number(i.tabId),
      folderPath: (Array.isArray(i.folderPath) ? i.folderPath : []).map(String).filter(Boolean),
      reason: String(i.reason ?? ''),
    }));
}

function normalizeClose(close) {
  return (Array.isArray(close) ? close : [])
    .filter((c) => Number.isInteger(Number(c.tabId)))
    .map((c) => ({ tabId: Number(c.tabId), reason: String(c.reason ?? ''), suggestBookmark: !!c.suggestBookmark }));
}

export function parseGroupResult(text) {
  const obj = parseJsonBlock(text);
  return normalizeGroups(obj && obj.groups);
}

export function parseStaleResult(text) {
  const obj = parseJsonBlock(text);
  if (!obj || !Array.isArray(obj.close)) throw new Error('Expected {"close":[...]}');
  return obj.close
    .filter((c) => Number.isInteger(Number(c.tabId)))
    .map((c) => ({ tabId: Number(c.tabId), reason: String(c.reason ?? ''), suggestBookmark: !!c.suggestBookmark, action: c.action === 'suspend' ? 'suspend' : 'close' }));
}

export function parseImportantResult(text) {
  const obj = parseJsonBlock(text);
  return normalizeImportant(obj && obj.important);
}

export function parseCommandResult(text) {
  const obj = parseJsonBlock(text) || {}; // model may emit literal null
  return {
    close: normalizeClose(obj.close),
    groups: Array.isArray(obj.groups) ? normalizeGroups(obj.groups) : [],
    important: Array.isArray(obj.important) ? normalizeImportant(obj.important) : [],
  };
}
