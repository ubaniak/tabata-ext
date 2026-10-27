// Clicking the toolbar icon opens the side panel, where the timer runs.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));
