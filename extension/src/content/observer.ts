import { clearSpecCache } from '../openapi/resolver';
import { injectButtons } from './inject';

let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;

function scheduleInject(): void {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    injectButtons();
  }, 150);
}

export function startObserver(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some(
      (m) =>
        m.type === 'childList' &&
        (m.addedNodes.length > 0 || m.removedNodes.length > 0),
    );

    if (relevant) {
      clearSpecCache();
      scheduleInject();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

export function stopObserver(): void {
  observer?.disconnect();
  observer = null;

  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
