const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

export type ButtonVariant = 'controller' | 'endpoint';

export interface CopyButtonOptions {
  variant: ButtonVariant;
  label: string;
  tag?: string;
  operationId?: string;
  onClick: (button: HTMLButtonElement) => void | Promise<void>;
}

export function createCopyButton(options: CopyButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `swagg-spec-copy-btn swagg-spec-copy-${options.variant}`;
  button.setAttribute('aria-label', options.label);

  if (options.tag) button.dataset.tag = options.tag;
  if (options.operationId) button.dataset.operationId = options.operationId;

  const icon = document.createElement('span');
  icon.className = 'swagg-spec-copy-btn__icon';
  icon.innerHTML = COPY_ICON_SVG;

  const text = document.createElement('span');
  text.className = 'swagg-spec-copy-btn__text';
  text.textContent = options.label;

  button.append(icon, text);

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await options.onClick(button);
  });

  return button;
}

export function setButtonCopiedState(button: HTMLButtonElement, copied: boolean): void {
  const text = button.querySelector('.swagg-spec-copy-btn__text');
  if (!text) return;

  if (copied) {
    button.classList.add('swagg-spec-copy-btn--copied');
    text.textContent = 'Copied!';
    window.setTimeout(() => {
      button.classList.remove('swagg-spec-copy-btn--copied');
      const variant = button.classList.contains('swagg-spec-copy-controller')
        ? 'Copy Controller'
        : 'Copy Endpoint';
      text.textContent = variant;
    }, 2000);
  }
}
