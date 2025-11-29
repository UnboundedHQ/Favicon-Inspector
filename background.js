// background.js

// Default Settings
const defaultSettings = {
  showCheckerboard: true, // Renamed from showWhiteBackground for clarity
  reduceMotion: false,    // New accessibility setting
  themeMode: 'light',     // New theme setting
  sidebarCollapsed: false // New UI setting
  // Removed 'theme' setting
};

// Set up initial settings storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('settings', (result) => {
    if (!result.settings) {
      chrome.storage.local.set({ settings: defaultSettings });
    } else {
        // Migration logic: add new settings if they don't exist
        const updatedSettings = { ...defaultSettings, ...result.settings };
        chrome.storage.local.set({ settings: updatedSettings });
    }
  });
});

// Listener for the extension action (icon click)
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id) {
    // 1. Check if the tab is a privileged URL (security/CSP handling)
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        // We still open the page but pass an error state
        const detailsUrl = chrome.runtime.getURL("favicon-details.html") + 
                          `?error=inaccessible&tabId=${tab.id}&url=${encodeURIComponent(tab.url)}`;
        chrome.tabs.create({ url: detailsUrl });
        return;
    }

    // 2. Open the details page in a new tab
    const detailsUrl = chrome.runtime.getURL("favicon-details.html") + 
                       `?url=${encodeURIComponent(tab.url)}&tabId=${tab.id}`;
    
    chrome.tabs.create({ url: detailsUrl });
  }
});