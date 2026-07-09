import {
  resolveOpenAPISpec,
  getAllOperations,
  parseTagFromDom,
  parseOperationFromDom,
  isSwaggerPage,
} from '../openapi/resolver';
import type { OpenAPISpec, ResolvedOperation } from '../openapi/types';

/* ─── Constants ──────────────────────────────────────────────────── */

const SIDEBAR_ID = 'swagg-spec-sidebar';
const TOGGLE_ID = 'swagg-spec-sidebar-toggle';
const SIDEBAR_OPEN_CLASS = 'swagg-spec-sidebar-open';
const COLLAPSED_CLASS = 'swagg-spec-sidebar--collapsed';
const STORAGE_KEY_OPEN = 'sidebarOpen';

/* ─── Chevron SVG ────────────────────────────────────────────────── */

const CHEVRON_SVG = `<svg class="swagg-spec-sidebar__chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

const LINK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;

const TOGGLE_ICON_SVG = `<svg class="swagg-spec-toggle-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;

/* ─── State ──────────────────────────────────────────────────────── */

interface TagGroup {
  name: string;
  description?: string;
  operations: ResolvedOperation[];
}

let sidebarEl: HTMLElement | null = null;
let toggleEl: HTMLButtonElement | null = null;
let listEl: HTMLElement | null = null;
let searchEl: HTMLInputElement | null = null;
let currentGroups: TagGroup[] = [];
let isOpen = true;

/* ─── Storage helpers ────────────────────────────────────────────── */

async function loadOpenState(): Promise<boolean> {
  try {
    const result = await chrome.storage.sync.get([STORAGE_KEY_OPEN]);
    return result[STORAGE_KEY_OPEN] !== false; // default open
  } catch {
    return true;
  }
}

async function saveOpenState(open: boolean): Promise<void> {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY_OPEN]: open });
  } catch {
    // storage unavailable — ignore
  }
}

/* ─── DOM helpers ────────────────────────────────────────────────── */

function highlight(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return escapeHtml(text).replace(
    regex,
    '<em class="swagg-spec-highlight">$1</em>',
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function methodClass(method: string): string {
  return `swagg-spec-sidebar__method--${method.toLowerCase()}`;
}

/* ─── Scroll helpers ─────────────────────────────────────────────── */

function scrollToController(tagName: string): void {
  const sections = document.querySelectorAll('.opblock-tag-section');
  for (const section of sections) {
    const name = parseTagFromDom(section);
    if (name && name.toLowerCase() === tagName.toLowerCase()) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
}

function scrollToEndpoint(method: string, path: string): void {
  const opblocks = document.querySelectorAll('.opblock');
  for (const opblock of opblocks) {
    const parsed = parseOperationFromDom(opblock);
    if (
      parsed &&
      parsed.method.toLowerCase() === method.toLowerCase() &&
      parsed.path === path
    ) {
      opblock.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Also expand it if collapsed
      const isCollapsed = !opblock.classList.contains('is-open');
      if (isCollapsed) {
        const summaryBtn = opblock.querySelector<HTMLElement>(
          '.opblock-summary-control, .opblock-summary',
        );
        summaryBtn?.click();
      }
      return;
    }
  }
}

/* ─── Build sidebar DOM ──────────────────────────────────────────── */

function buildSidebarDom(): void {
  if (document.getElementById(SIDEBAR_ID)) return;

  // --- Sidebar panel ---
  const sidebar = document.createElement('nav');
  sidebar.id = SIDEBAR_ID;
  sidebar.setAttribute('aria-label', 'API navigation');
  sidebar.setAttribute('role', 'navigation');

  // Header
  const header = document.createElement('div');
  header.className = 'swagg-spec-sidebar__header';
  header.innerHTML = `
    <span class="swagg-spec-sidebar__logo" aria-hidden="true">${LOGO_SVG}</span>
    <span class="swagg-spec-sidebar__title">API Navigator</span>
  `;

  // Search
  const searchWrap = document.createElement('div');
  searchWrap.className = 'swagg-spec-sidebar__search-wrap';

  const search = document.createElement('input');
  search.type = 'search';
  search.id = 'swagg-spec-sidebar-search';
  search.className = 'swagg-spec-sidebar__search';
  search.placeholder = 'Search controllers & endpoints…';
  search.setAttribute('aria-label', 'Search API endpoints');
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('spellcheck', 'false');
  searchWrap.appendChild(search);

  // List
  const list = document.createElement('div');
  list.className = 'swagg-spec-sidebar__list';
  list.setAttribute('role', 'list');

  sidebar.appendChild(header);
  sidebar.appendChild(searchWrap);
  sidebar.appendChild(list);
  document.body.appendChild(sidebar);

  // --- Toggle button ---
  const toggle = document.createElement('button');
  toggle.id = TOGGLE_ID;
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Toggle API sidebar');
  toggle.setAttribute('title', 'Toggle API sidebar');
  toggle.innerHTML = TOGGLE_ICON_SVG;
  document.body.appendChild(toggle);

  // Store refs
  sidebarEl = sidebar;
  toggleEl = toggle;
  listEl = list;
  searchEl = search;

  // Wire up toggle
  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    applySidebarState();
    void saveOpenState(isOpen);
  });

  // Wire up search
  search.addEventListener('input', () => {
    filterList(search.value.trim());
  });
}

/* ─── Apply open/closed visual state ────────────────────────────── */

function applySidebarState(): void {
  if (!sidebarEl || !toggleEl) return;

  if (isOpen) {
    sidebarEl.classList.remove(COLLAPSED_CLASS);
    toggleEl.classList.remove(COLLAPSED_CLASS);
    document.body.classList.add(SIDEBAR_OPEN_CLASS);
    toggleEl.setAttribute('title', 'Collapse sidebar');
    toggleEl.setAttribute('aria-label', 'Collapse sidebar');
  } else {
    sidebarEl.classList.add(COLLAPSED_CLASS);
    toggleEl.classList.add(COLLAPSED_CLASS);
    document.body.classList.remove(SIDEBAR_OPEN_CLASS);
    toggleEl.setAttribute('title', 'Expand sidebar');
    toggleEl.setAttribute('aria-label', 'Expand sidebar');
  }
}

/* ─── Build group list from spec ─────────────────────────────────── */

function buildGroupsFromSpec(spec: OpenAPISpec): TagGroup[] {
  const all = getAllOperations(spec);

  // Collect all tags that appear in operations
  const tagMap = new Map<string, ResolvedOperation[]>();

  for (const op of all) {
    const tags = op.operation.tags?.length ? op.operation.tags : ['default'];
    for (const tag of tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag)!.push(op);
    }
  }

  // Build ordered list: spec.tags order first, then remaining
  const groups: TagGroup[] = [];
  const specTags = spec.tags ?? [];
  const seen = new Set<string>();

  for (const t of specTags) {
    const ops = tagMap.get(t.name) ?? [];
    groups.push({ name: t.name, description: t.description, operations: ops });
    seen.add(t.name);
  }

  for (const [name, ops] of tagMap) {
    if (!seen.has(name)) {
      groups.push({ name, operations: ops });
    }
  }

  return groups;
}

/* ─── Build group list from DOM (fallback) ───────────────────────── */

function buildGroupsFromDom(): TagGroup[] {
  const sections = document.querySelectorAll('.opblock-tag-section');
  const groups: TagGroup[] = [];

  for (const section of sections) {
    const name = parseTagFromDom(section);
    if (!name) continue;

    const opblocks = section.querySelectorAll('.opblock');
    const operations: ResolvedOperation[] = [];

    for (const opblock of opblocks) {
      const parsed = parseOperationFromDom(opblock);
      if (!parsed) continue;

      // Try to get summary from DOM
      const summaryEl = opblock.querySelector(
        '.opblock-summary-description, .opblock-summary-path',
      );
      const summary = summaryEl?.textContent?.trim();

      operations.push({
        method: parsed.method,
        path: parsed.path,
        operationKey: `${parsed.method}:${parsed.path}`,
        operation: { summary, tags: [name] },
      });
    }

    groups.push({ name, operations });
  }

  return groups;
}

/* ─── Render the list ────────────────────────────────────────────── */

function renderGroups(groups: TagGroup[], query = ''): void {
  if (!listEl) return;
  listEl.innerHTML = '';

  if (groups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'swagg-spec-sidebar__empty';
    empty.textContent = 'No controllers found yet.\nWaiting for Swagger UI…';
    listEl.appendChild(empty);
    return;
  }

  const q = query.toLowerCase();

  let visibleGroups = 0;

  for (const group of groups) {
    const matchesController = !q || group.name.toLowerCase().includes(q);

    const filteredOps = group.operations.filter(
      (op) =>
        !q ||
        matchesController ||
        op.path.toLowerCase().includes(q) ||
        op.method.toLowerCase().includes(q) ||
        op.operation.summary?.toLowerCase().includes(q),
    );

    // Hide group entirely if no match
    if (!matchesController && filteredOps.length === 0) continue;
    visibleGroups++;

    const details = document.createElement('details');
    details.className = 'swagg-spec-sidebar__group';
    details.open = true; // default expanded; search overrides visibility

    // Summary / header
    const summary = document.createElement('summary');
    summary.className = 'swagg-spec-sidebar__group-header';
    summary.setAttribute('role', 'listitem');
    summary.title = group.description ?? group.name;

    const chevronSpan = document.createElement('span');
    chevronSpan.innerHTML = CHEVRON_SVG;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'swagg-spec-sidebar__group-name';
    nameSpan.innerHTML = highlight(group.name, q);

    const countSpan = document.createElement('span');
    countSpan.className = 'swagg-spec-sidebar__group-count';
    countSpan.textContent = String(filteredOps.length);
    countSpan.title = `${filteredOps.length} endpoint${filteredOps.length !== 1 ? 's' : ''}`;

    const navBtn = document.createElement('button');
    navBtn.className = 'swagg-spec-sidebar__nav-btn';
    navBtn.type = 'button';
    navBtn.setAttribute('aria-label', `Go to ${group.name} section`);
    navBtn.title = `Scroll to "${group.name}" section`;
    navBtn.innerHTML = LINK_SVG;
    navBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      scrollToController(group.name);
    });

    summary.appendChild(chevronSpan);
    summary.appendChild(nameSpan);
    summary.appendChild(countSpan);
    summary.appendChild(navBtn);
    details.appendChild(summary);

    // Endpoint rows
    if (filteredOps.length > 0) {
      const endpointList = document.createElement('div');
      endpointList.className = 'swagg-spec-sidebar__endpoints';

      for (const op of filteredOps) {
        const row = document.createElement('button');
        row.className = 'swagg-spec-sidebar__endpoint';
        row.type = 'button';
        row.setAttribute(
          'aria-label',
          `${op.method} ${op.path}${op.operation.summary ? ': ' + op.operation.summary : ''}`,
        );
        row.title = op.operation.summary
          ? `${op.method} ${op.path}\n${op.operation.summary}`
          : `${op.method} ${op.path}`;

        const methodBadge = document.createElement('span');
        methodBadge.className = `swagg-spec-sidebar__method ${methodClass(op.method)}`;
        methodBadge.textContent = op.method;
        methodBadge.setAttribute('aria-hidden', 'true');

        const pathSpan = document.createElement('span');
        pathSpan.className = 'swagg-spec-sidebar__path';
        pathSpan.innerHTML = highlight(op.path, q);
        pathSpan.title = op.path;

        row.appendChild(methodBadge);
        row.appendChild(pathSpan);

        row.addEventListener('click', () => {
          scrollToEndpoint(op.method, op.path);
        });

        endpointList.appendChild(row);
      }

      details.appendChild(endpointList);
    }

    listEl.appendChild(details);
  }

  if (visibleGroups === 0 && q) {
    const empty = document.createElement('div');
    empty.className = 'swagg-spec-sidebar__empty';
    empty.textContent = `No results for "${query}"`;
    listEl.appendChild(empty);
  }
}

/* ─── Filter ─────────────────────────────────────────────────────── */

function filterList(query: string): void {
  renderGroups(currentGroups, query);
}

/* ─── Populate ───────────────────────────────────────────────────── */

async function populate(): Promise<void> {
  const spec = await resolveOpenAPISpec();

  if (spec) {
    currentGroups = buildGroupsFromSpec(spec);
  } else {
    currentGroups = buildGroupsFromDom();
  }

  const query = searchEl?.value.trim() ?? '';
  renderGroups(currentGroups, query);
}

/* ─── Public API ─────────────────────────────────────────────────── */

/**
 * Called once on page load. Builds the sidebar DOM and populates it.
 */
export async function initSidebar(): Promise<void> {
  if (!isSwaggerPage()) return;

  isOpen = await loadOpenState();

  buildSidebarDom();
  applySidebarState();
  await populate();
}

/**
 * Called by the MutationObserver whenever Swagger UI re-renders.
 * Re-populates the list without rebuilding the DOM.
 */
export async function refreshSidebar(): Promise<void> {
  if (!sidebarEl) return; // sidebar not yet built
  await populate();
}
