chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ debug: false });
});
