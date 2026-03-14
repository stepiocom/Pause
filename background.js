/**
 * Pause (停) — Background Service Worker
 * Minimal. Handles installation events and badge state.
 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    // Set default storage values on first install
    chrome.storage.local.set({
      pause_enabled: true,
      pause_lang: null, // null = auto-detect from browser
    });
  }
});

// Update badge when enabled/disabled
chrome.storage.onChanged.addListener((changes) => {
  if (changes.pause_enabled) {
    const enabled = changes.pause_enabled.newValue;
    chrome.action.setBadgeText({ text: enabled ? "" : "off" });
    chrome.action.setBadgeBackgroundColor({ color: "#888888" });
  }
});
