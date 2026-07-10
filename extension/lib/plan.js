const ACTIONS = new Set(['closeTab', 'groupTabs', 'createBookmark', 'deleteBookmark']);

export function indexById(snapshots) {
  return new Map(snapshots.map((s) => [s.tabId, s]));
}

// `tabsById` is accepted but unused for now; Task 7 (Phase 1) will use it to
// split cross-window groups. Kept as a tolerant second param so the
// orchestrator can pass it ahead of that change without churn.
export function mapGroupResult(groups, tabsById) {
  return groups.map((g, i) => ({
    itemId: `group-${i}`,
    action: 'groupTabs',
    status: 'pending',
    reason: `Group "${g.name}" (${g.tabIds.length} tabs)`,
    data: { groupName: g.name, color: g.color, tabIds: g.tabIds },
  }));
}

export function mapStaleResult(stale, tabsById, candidateIds = null) {
  return stale
    .map((s) => {
      if (candidateIds && !candidateIds.has(s.tabId)) return null;
      const t = tabsById.get(s.tabId);
      if (!t) return null;
      return {
        itemId: `close-${t.tabId}`,
        action: 'closeTab',
        status: 'pending',
        reason: s.reason || `Idle ${t.idleDays} days`,
        data: {
          tabId: t.tabId, url: t.url, title: t.title,
          windowId: t.windowId, index: t.index, pinned: t.pinned,
          bookmarkFirst: !!s.suggestBookmark,
        },
      };
    })
    .filter(Boolean);
}

export function mapImportantResult(important, tabsById) {
  return important
    .map((i) => {
      const t = tabsById.get(i.tabId);
      if (!t) return null;
      return {
        itemId: `bm-${t.tabId}`,
        action: 'createBookmark',
        status: 'pending',
        reason: i.reason || 'Worth keeping',
        data: { tabId: t.tabId, url: t.url, title: t.title, folderPath: i.folderPath.length ? i.folderPath : ['Browser Organizer'] },
      };
    })
    .filter(Boolean);
}

export function validatePlanItem(item) {
  return !!item
    && typeof item.itemId === 'string'
    && ACTIONS.has(item.action)
    && typeof item.status === 'string'
    && typeof item.data === 'object' && item.data !== null;
}
