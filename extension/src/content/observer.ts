import { clearSpecCache } from '../openapi/resolver';
import { injectButtons } from './inject';
import { refreshSidebar } from '../ui/sidebar';

let observer: MutationObserver | null = null;
let debounceTimer: number | null = null;

function isExtensionUiMutation(mutation: MutationRecord): boolean {
  if (mutation.type !== 'childList') return false;

  const target = mutation.target as Element | null;
  if (
    target &&
    (target.id === 'swagg-spec-sidebar' ||
      target.id === 'swagg-spec-sidebar-toggle' ||
      target.classList.contains('swagg-spec-toast-container') ||
      target.closest('#swagg-spec-sidebar, #swagg-spec-sidebar-toggle, .swagg-spec-toast-container'))
  ) {
    return true;
  }

  const isExtensionNode = (node: Node) => {
    if (!(node instanceof Element)) return false;
    return (
      node.id === 'swagg-spec-sidebar' ||
      node.id === 'swagg-spec-sidebar-toggle' ||
      node.classList.contains('swagg-spec-toast-container') ||
      node.closest('#swagg-spec-sidebar, #swagg-spec-sidebar-toggle, .swagg-spec-toast-container') !== null
    );
  };

  const hasOnlyExtensionNodes = (nodes: NodeList) => {
    if (nodes.length === 0) return true;
    return Array.from(nodes).every(isExtensionNode);
  };

  return hasOnlyExtensionNodes(mutation.addedNodes) && hasOnlyExtensionNodes(mutation.removedNodes);
}

function scheduleInject(): void {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    injectButtons();
    void refreshSidebar();
  }, 150);
}

export function startObserver(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some(
      (m) =>
        m.type === 'childList' &&
        (m.addedNodes.length > 0 || m.removedNodes.length > 0) &&
        !isExtensionUiMutation(m),
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

