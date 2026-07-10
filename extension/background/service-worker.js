// Open the side panel when the toolbar icon is clicked. chrome.action.onClicked
// only fires when there is NO default_popup — the manifest has none, so this works.
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
