// Strip ANSI/CSI escape sequences (colors, cursor moves) some CLIs emit even
// when piped — their '[' would otherwise fool bracket extraction.
function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;?]*[a-zA-Z]/g, '');
}

// Extract the first *balanced* {…} or […] block starting at `open`, respecting
// string literals/escapes so a brace inside a string doesn't end it early.
function extractBalanced(t, open) {
  const close = open === '{' ? '}' : ']';
  const start = t.indexOf(open);
  if (start < 0) return null;
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
  // Prefer an object (all our expected shapes are objects), then an array.
  for (const open of ['{', '[']) {
    const block = extractBalanced(t, open);
    if (block) { try { return JSON.parse(block); } catch { /* fall through */ } }
  }
  throw new Error('No JSON found in model output');
}

const COLORS = new Set(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']);

export function parseGroupResult(text) {
  const obj = parseJsonBlock(text);
  if (!obj || !Array.isArray(obj.groups)) throw new Error('Expected {"groups":[...]}');
  return obj.groups
    .map((g) => ({
      name: String(g.name ?? 'Group').slice(0, 40),
      color: COLORS.has(g.color) ? g.color : 'grey',
      tabIds: (Array.isArray(g.tabIds) ? g.tabIds : []).map(Number).filter(Number.isInteger),
    }))
    .filter((g) => g.tabIds.length > 0);
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
  if (!obj || !Array.isArray(obj.important)) throw new Error('Expected {"important":[...]}');
  return obj.important
    .filter((i) => Number.isInteger(Number(i.tabId)))
    .map((i) => ({
      tabId: Number(i.tabId),
      folderPath: (Array.isArray(i.folderPath) ? i.folderPath : []).map(String).filter(Boolean),
      reason: String(i.reason ?? ''),
    }));
}

export function parseCommandResult(text) {
  const obj = parseJsonBlock(text);
  return {
    close: Array.isArray(obj.close) ? obj.close.filter((c) => Number.isInteger(Number(c.tabId))).map((c) => ({ tabId: Number(c.tabId), reason: String(c.reason ?? ''), suggestBookmark: !!c.suggestBookmark })) : [],
    groups: Array.isArray(obj.groups) ? parseGroupResult(JSON.stringify({ groups: obj.groups })) : [],
    important: Array.isArray(obj.important) ? parseImportantResult(JSON.stringify({ important: obj.important })) : [],
  };
}
