import { normalizeUrl, isHttpUrl, isPrivateHost } from './url-utils.js';

export function deleteItem(b, reason) {
  return {
    itemId: `del-${b.id}`,
    action: 'deleteBookmark',
    status: 'pending',
    reason,
    data: { bookmarkId: b.id, parentId: b.parentId, index: b.index, title: b.title, url: b.url },
  };
}

export function findDuplicateBookmarks(bookmarks) {
  const seen = new Map();
  const items = [];
  for (const b of bookmarks) {
    if (!b.url) continue;
    const key = normalizeUrl(b.url);
    if (seen.has(key)) items.push(deleteItem(b, `Duplicate of "${seen.get(key).title || seen.get(key).url}"`));
    else seen.set(key, b);
  }
  return items;
}

export function findStaleBookmarks(bookmarks, visitsMap, thresholdDays, now) {
  const cutoff = now - thresholdDays * 86400000;
  return bookmarks
    .filter((b) => b.url)
    .filter((b) => (visitsMap.get(normalizeUrl(b.url)) ?? b.dateAdded ?? 0) < cutoff)
    .map((b) => deleteItem(b, `Not visited in ${thresholdDays}+ days`));
}

export async function getVisitsMap(bookmarks, chromeApi = chrome) {
  const map = new Map();
  for (const b of bookmarks) {
    if (!isHttpUrl(b.url)) continue;
    const norm = normalizeUrl(b.url);
    const variants = new Set([b.url, norm, norm.endsWith('/') ? norm.slice(0, -1) : `${norm}/`]);
    let latest = 0;
    for (const v of variants) {
      const visits = await chromeApi.history.getVisits({ url: v });
      for (const visit of visits) latest = Math.max(latest, visit.visitTime);
    }
    if (latest) map.set(norm, latest);
  }
  return map;
}

async function isDead(url, fetchFn, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetchFn(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetchFn(url, { method: 'GET', redirect: 'manual', signal: controller.signal });
    }
    if (res.status === 404 || res.status === 410) return `HTTP ${res.status}`;
    return null; // 2xx, 3xx, 401/403, 5xx all treated as alive (conservative)
  } catch (err) {
    if (err && err.name === 'AbortError') return null; // timeout != dead (conservative)
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

// Increment a strike for each currently-dead id; clear strikes for ids that
// recovered (not in deadIds). Confirm deletion only at >=2 strikes.
export function recordDeadStrikes(prevStrikes, deadIds) {
  const strikes = {};
  const confirmed = [];
  for (const id of deadIds) {
    strikes[id] = (prevStrikes[id] || 0) + 1;
    if (strikes[id] >= 2) confirmed.push(id);
  }
  // ids in prevStrikes that recovered are simply dropped (strike reset).
  return { strikes, confirmed };
}

export function dedupeDeletes(items) {
  const byId = new Map();
  for (const it of items) {
    const key = it.data.bookmarkId;
    if (byId.has(key)) {
      const merged = byId.get(key);
      if (!merged.reason.includes(it.reason)) merged.reason = `${merged.reason}; ${it.reason}`;
    } else {
      byId.set(key, { ...it, reason: it.reason });
    }
  }
  return [...byId.values()];
}

export async function checkDeadLinks(bookmarks, deps = {}) {
  const fetchFn = deps.fetchFn || ((url, opts) => fetch(url, opts));
  const timeoutMs = deps.timeoutMs ?? 8000;
  const concurrency = deps.concurrency ?? 6;
  const queue = bookmarks.filter((b) => isHttpUrl(b.url) && !isPrivateHost(b.url));
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < queue.length) {
      const b = queue[idx++];
      const dead = await isDead(b.url, fetchFn, timeoutMs);
      if (dead) results.push(deleteItem(b, `Dead link (${dead})`));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}
