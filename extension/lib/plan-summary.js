// Plan summarization shared by the background worker (digest notification) and
// the panel UI. Lives in lib/ so the background never depends on the UI layer.
export function summarize(items) {
  const out = {};
  for (const it of items) out[it.action] = (out[it.action] || 0) + 1;
  return out;
}

export function digestText(items) {
  if (!items.length) return 'Your browser looks tidy — nothing to review.';
  const c = summarize(items);
  const parts = [];
  if (c.closeTab) parts.push(`${c.closeTab} tabs to close`);
  if (c.discardTab) parts.push(`${c.discardTab} tabs to suspend`);
  if (c.groupTabs) parts.push(`${c.groupTabs} group${c.groupTabs > 1 ? 's' : ''}`);
  if (c.createBookmark) parts.push(`${c.createBookmark} to bookmark`);
  if (c.deleteBookmark) parts.push(`${c.deleteBookmark} bookmarks to clean`);
  return `${parts.join(', ')} — open to review.`;
}
