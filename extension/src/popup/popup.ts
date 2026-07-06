const debugCheckbox = document.getElementById('debug') as HTMLInputElement;

chrome.storage.sync.get(['debug'], (result) => {
  debugCheckbox.checked = Boolean(result.debug);
});

debugCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ debug: debugCheckbox.checked });
});
