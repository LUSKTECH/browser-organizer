export const DEFAULTS = {
  automationMode: 'review',            // 'review' | 'auto'
  enabledFeatures: {
    staleTabs: true, groupTabs: true, importantBookmarks: true, cleanBookmarks: true,
  },
  staleTabDays: 14,                    // tabs idle longer are close candidates
  staleBookmarkDays: 180,             // bookmarks unvisited longer are cleanup candidates
  undoRetentionDays: 7,
  deadLinkBatchSize: 200,
  adapter: 'claude',                   // native host adapter name
  cliCommand: 'claude',                // override if the CLI binary is elsewhere
  scanIntervalMinutes: 720,           // auto-run cadence (12h)
};

export async function getSettings() {
  const { settings = {} } = await chrome.storage.sync.get('settings');
  return { ...DEFAULTS, ...settings, enabledFeatures: { ...DEFAULTS.enabledFeatures, ...(settings.enabledFeatures || {}) } };
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  if (patch.enabledFeatures) next.enabledFeatures = { ...current.enabledFeatures, ...patch.enabledFeatures };
  await chrome.storage.sync.set({ settings: next });
  return next;
}
