// Canonical human labels for plan actions — used by both the executor (undo-log
// labels) and the panel UI, so they can't drift ("Bookmark" vs "Bookmark tab").
export const ACTION_LABELS = {
  closeTab: 'Close tab',
  groupTabs: 'Group tabs',
  createBookmark: 'Bookmark tab',
  deleteBookmark: 'Delete bookmark',
  discardTab: 'Suspend tab',
};
