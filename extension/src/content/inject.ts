import { buildControllerMarkdown, buildControllerMarkdownFromDom } from '../markdown/controller';
import { buildEndpointMarkdown, buildEndpointMarkdownFromDom } from '../markdown/endpoint';
import {
  findOperation,
  isSwaggerPage,
  parseOperationFromDom,
  parseTagFromDom,
  resolveOpenAPISpec,
} from '../openapi/resolver';
import { createCopyButton, createActionWrapper, setButtonCopiedState } from '../ui/button';
import { copyToClipboard, showToast } from '../ui/toast';

const CONTROLLER_BTN_SELECTOR = '.swagg-spec-copy-controller';
const ENDPOINT_BTN_SELECTOR = '.swagg-spec-copy-endpoint';

let debug = false;

export function setDebug(enabled: boolean): void {
  debug = enabled;
}

function log(...args: unknown[]): void {
  if (debug) console.log('[swagg-spec]', ...args);
}

async function handleCopy(markdown: string, button: HTMLButtonElement): Promise<void> {
  try {
    await copyToClipboard(markdown);
    setButtonCopiedState(button, true);
    showToast('Copied to clipboard', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Copy failed';
    showToast(message, 'error');
    log('Copy error:', error);
  }
}

async function onCopyEndpoint(opblock: Element, button: HTMLButtonElement): Promise<void> {
  const parsed = parseOperationFromDom(opblock);
  if (!parsed) {
    showToast('Could not parse endpoint', 'error');
    return;
  }

  const spec = await resolveOpenAPISpec();
  if (spec) {
    const resolved = findOperation(spec, parsed.method, parsed.path);
    if (resolved) {
      await handleCopy(
        buildEndpointMarkdown(spec, resolved, { opblock, displayPath: parsed.path }),
        button,
      );
      return;
    }
  }

  await handleCopy(buildEndpointMarkdownFromDom(opblock), button);
}

async function onCopyController(
  tagName: string,
  section: Element,
  button: HTMLButtonElement,
): Promise<void> {
  const spec = await resolveOpenAPISpec();

  if (spec) {
    const opblocks = Array.from(section.querySelectorAll('.opblock'));
    await handleCopy(buildControllerMarkdown(spec, tagName, opblocks), button);
    return;
  }

  const opblocks = Array.from(section.querySelectorAll('.opblock'));
  await handleCopy(buildControllerMarkdownFromDom(tagName, opblocks), button);
}

function injectControllerButton(section: Element): void {
  const tagHeader =
    section.querySelector('.opblock-tag') ??
    section.querySelector('h3, h4');

  if (!tagHeader || section.querySelector(CONTROLLER_BTN_SELECTOR)) return;

  const tagName = parseTagFromDom(section);
  if (!tagName) return;

  const actions = createActionWrapper('controller');
  const button = createCopyButton({
    variant: 'controller',
    label: 'Copy Controller',
    tag: tagName,
    onClick: (btn) => onCopyController(tagName, section, btn),
  });

  const spacer = document.createElement('span');
  spacer.className = 'swagg-spec-tag-spacer';
  spacer.setAttribute('aria-hidden', 'true');

  actions.appendChild(button);

  const expandBtn = tagHeader.querySelector('.expand-operation');
  if (expandBtn) {
    tagHeader.insertBefore(actions, expandBtn);
    tagHeader.insertBefore(spacer, actions);
  } else {
    tagHeader.appendChild(spacer);
    tagHeader.appendChild(actions);
  }
  log('Injected controller button for', tagName);
}

function injectEndpointButton(opblock: Element): void {
  if (opblock.querySelector(ENDPOINT_BTN_SELECTOR)) return;

  const summary =
    opblock.querySelector('.opblock-summary') ??
    opblock.querySelector('.opblock-summary-wrapper');

  if (!summary) return;

  const parsed = parseOperationFromDom(opblock);
  const operationId = parsed ? `${parsed.method}:${parsed.path}` : undefined;

  const actions = createActionWrapper('endpoint');
  const button = createCopyButton({
    variant: 'endpoint',
    label: 'Copy Endpoint',
    operationId,
    onClick: (btn) => onCopyEndpoint(opblock, btn),
  });

  actions.appendChild(button);
  summary.appendChild(actions);
  log('Injected endpoint button for', operationId);
}

export function injectButtons(root: ParentNode = document): void {
  if (!isSwaggerPage()) return;

  const tagSections = root.querySelectorAll('.opblock-tag-section');
  tagSections.forEach((section) => injectControllerButton(section));

  const opblocks = root.querySelectorAll('.opblock');
  opblocks.forEach((opblock) => injectEndpointButton(opblock));
}

export async function initInjection(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(['debug']);
    debug = Boolean(result.debug);
  } catch {
    // storage unavailable
  }

  if (!isSwaggerPage()) {
    log('Not a Swagger page, skipping');
    return;
  }

  injectButtons();
}
