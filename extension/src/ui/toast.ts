let toastContainer: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (toastContainer && document.body.contains(toastContainer)) {
    return toastContainer;
  }

  toastContainer = document.createElement('div');
  toastContainer.className = 'swagg-spec-toast-container';
  toastContainer.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  const container = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `swagg-spec-toast swagg-spec-toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('swagg-spec-toast--visible'));

  window.setTimeout(() => {
    toast.classList.remove('swagg-spec-toast--visible');
    window.setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  const ok = document.execCommand('copy');
  textarea.remove();

  if (!ok) {
    throw new Error('Clipboard copy failed');
  }
}
