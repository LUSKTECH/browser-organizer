const ACTIONS = new Set(['closeTab', 'groupTabs', 'createBookmark', 'deleteBookmark']);

export function indexById(snapshots) {
  return new Map(snapshots.map((s) => [s.tabId, s]));
}

// Splits each model-returned group into one PlanItem per window, since
// chrome.tabs.group is per-window and cannot span windows. Note: unlike the
// plan's draft (which skipped windows with fewer than 2 members), a
// single-tab window is still emitted as its own item — filtering it out
// would silently drop tabs the model asked to group with no recourse for
// the user to see or act on them.
export function mapGroupResult(groups, tabsById) {
  const items = [];
  groups.forEach((g, gi) => {
    const byWindow = new Map();
    for (const id of g.tabIds) {
      const t = tabsById.get(id);
      if (!t) continue;
      if (!byWindow.has(t.windowId)) byWindow.set(t.windowId, []);
      byWindow.get(t.windowId).push(t);
    }
    let wi = 0;
    for (const [windowId, members] of byWindow) {
      items.push({
        itemId: `group-${gi}-${wi++}`,
        action: 'groupTabs',
        status: 'pending',
        reason: `Group "${g.name}" (${members.length} tabs)`,
        data: {
          groupName: g.name, color: g.color, windowId,
          tabIds: members.map((m) => m.tabId),
          members: members.map((m) => ({ tabId: m.tabId, title: m.title, url: m.url })),
        },
      });
    }
  });
  return items;
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
