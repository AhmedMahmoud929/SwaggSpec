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

// Scrollspy variables
let activeObserver: IntersectionObserver | null = null;
const visibleOpblocks = new Set<Element>();
let currentActiveOpblock: Element | null = null;
let isProgrammaticScrolling = false;
let programmaticScrollTimeout: number | null = null;



/* ─── Helpers ─────────────────────────────────────────────── */

function isMobile(): boolean {
  return window.matchMedia('(max-width: 768px)').matches;
}

function normalizePath(p: string): string {
  return p.replace(/\u200b/g, '').replace(/\/$/, '').trim();
}


/* ─── Theme detection ───────────────────────────────────────── */

/** Dark-mode class names commonly used by Swagger host pages */
const DARK_CLASS_PATTERNS = [
  'dark',
  'dark-mode',
  'dark-theme',
  'theme-dark',
  'darkmode',
  'night-mode',
  'inverted',
];

/**
 * Decide whether the page is in dark mode via three signals (any one wins):
 * 1. Known dark-mode CSS class on <html> or <body>
 * 2. data-theme / data-color-scheme / color-scheme attribute
 * 3. Computed background luminance of the Swagger UI root (< 0.18 → dark)
 * 4. OS-level prefers-color-scheme: dark (lowest priority)
 */
function detectDark(): boolean {
  const roots = [document.documentElement, document.body];

  // 1. class names
  for (const el of roots) {
    const classList = Array.from(el.classList).map((c) => c.toLowerCase());
    if (DARK_CLASS_PATTERNS.some((p) => classList.includes(p))) return true;
  }

  // 2. attributes
  const themeAttrs = ['data-theme', 'data-color-scheme', 'data-bs-theme', 'color-scheme'];
  for (const el of roots) {
    for (const attr of themeAttrs) {
      const val = el.getAttribute(attr)?.toLowerCase();
      if (val && (val.includes('dark') || val === 'inverted')) return true;
    }
  }

  // 3. Computed background luminance of the swagger-ui container
  const swaggerRoot =
    document.querySelector<HTMLElement>('.swagger-ui') ??
    document.querySelector<HTMLElement>('#swagger-ui') ??
    document.body;
  const bg = window.getComputedStyle(swaggerRoot).backgroundColor;
  const rgb = bg.match(/\d+/g)?.map(Number);
  if (rgb && rgb.length >= 3) {
    // Relative luminance (sRGB)
    const [r, g, b] = rgb.map((c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance < 0.18) return true;
  }

  // 4. OS preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Search icon SVGs — light and dark stroke colors */
const SEARCH_ICON_LIGHT =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%237a8898' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E\") no-repeat 10px center";

const SEARCH_ICON_DARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%236b7a99' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E\") no-repeat 10px center";

/** Apply or remove dark theme on the sidebar element */
function applyTheme(): void {
  if (!sidebarEl) return;
  const dark = detectDark();
  if (dark) {
    sidebarEl.setAttribute('data-theme', 'dark');
  } else {
    sidebarEl.removeAttribute('data-theme');
  }
  // Update search icon color to match theme
  if (searchEl) {
    searchEl.style.backgroundImage = dark ? SEARCH_ICON_DARK : SEARCH_ICON_LIGHT;
  }
}

let themeObserver: MutationObserver | null = null;

/** Watch for class/attribute changes on <html> and <body>, plus OS media query */
function watchTheme(): void {
  if (themeObserver) return;

  themeObserver = new MutationObserver(() => applyTheme());
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-bs-theme', 'color-scheme'],
  });
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-bs-theme', 'color-scheme'],
  });

  // Also watch the swagger-ui container's style changes (some themes change bg dynamically)
  const swaggerRoot =
    document.querySelector('.swagger-ui') ??
    document.querySelector('#swagger-ui');
  if (swaggerRoot) {
    themeObserver.observe(swaggerRoot, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }

  // OS-level preference
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => applyTheme());
}

/* ─── Storage helpers ────────────────────────────────────────────── */

async function loadOpenState(): Promise<boolean> {
  // On desktop the sidebar is always open — don't load stored state.
  if (!isMobile()) return true;
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

function expandControllerSection(section: Element): void {
  const hasVisibleOps = section.querySelector('.opblock') !== null;
  console.log('[swagg-spec] expandControllerSection:', {
    hasVisibleOps,
    sectionTag: parseTagFromDom(section)
  });
  if (!hasVisibleOps) {
    const toggleBtn = section.querySelector<HTMLElement>('.expand-operation, .opblock-tag, h3, h4');
    console.log('[swagg-spec] Section is collapsed. Clicking toggle button:', toggleBtn);
    toggleBtn?.click();
  }
}

function scrollToController(tagName: string): void {
  console.log('[swagg-spec] scrollToController requested for:', tagName);
  const sections = document.querySelectorAll('.opblock-tag-section');
  console.log('[swagg-spec] Total sections found in DOM:', sections.length);
  
  let found = false;
  for (const section of sections) {
    const name = parseTagFromDom(section);
    const isMatch = name && name.toLowerCase() === tagName.toLowerCase();
    console.log('[swagg-spec] Checking section tag:', { parsedName: name, targetName: tagName, isMatch });
    
    if (isMatch) {
      found = true;
      expandControllerSection(section);
      
      // Disable Scrollspy during scroll
      isProgrammaticScrolling = true;
      if (programmaticScrollTimeout !== null) {
        window.clearTimeout(programmaticScrollTimeout);
      }

      // Wait for expand animation/rendering to settle before scrolling
      setTimeout(() => {
        const firstOp = section.querySelector('.opblock');
        console.log('[swagg-spec] Scrolling to target. First endpoint found:', firstOp);
        if (firstOp) {
          setActiveElement(firstOp);
          firstOp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        programmaticScrollTimeout = window.setTimeout(() => {
          isProgrammaticScrolling = false;
          programmaticScrollTimeout = null;
        }, 1000);
      }, 150);
      return;
    }
  }
  if (!found) {
    console.error('[swagg-spec] No matching section found in DOM for tag:', tagName);
  }
}

function scrollToEndpoint(method: string, path: string): void {
  const opblocks = document.querySelectorAll('.opblock');
  const targetPath = normalizePath(path);
  for (const opblock of opblocks) {
    const parsed = parseOperationFromDom(opblock);
    if (
      parsed &&
      parsed.method.toLowerCase() === method.toLowerCase() &&
      normalizePath(parsed.path) === targetPath
    ) {
      // Set active immediately to prevent Scrollspy interference
      setActiveElement(opblock);

      isProgrammaticScrolling = true;
      if (programmaticScrollTimeout !== null) {
        window.clearTimeout(programmaticScrollTimeout);
      }

      opblock.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Trigger temporary pulse highlight
      opblock.classList.remove('swagg-spec-opblock--pulse');
      void (opblock as HTMLElement).offsetWidth; // force reflow to restart CSS keyframe animation
      opblock.classList.add('swagg-spec-opblock--pulse');

      setTimeout(() => {
        opblock.classList.remove('swagg-spec-opblock--pulse');
      }, 1500);

      // Also expand it if collapsed
      const isCollapsed = !opblock.classList.contains('is-open');
      if (isCollapsed) {
        const summaryBtn = opblock.querySelector<HTMLElement>(
          '.opblock-summary-control, .opblock-summary',
        );
        summaryBtn?.click();
      }

      programmaticScrollTimeout = window.setTimeout(() => {
        isProgrammaticScrolling = false;
        programmaticScrollTimeout = null;
      }, 1000);
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

  // Apply theme immediately before anything else renders
  applyTheme();
  watchTheme();

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

  // On desktop the sidebar is always visible — CSS handles it.
  // Only manipulate classes on mobile.
  if (!isMobile()) {
    sidebarEl.classList.remove(COLLAPSED_CLASS);
    toggleEl.classList.remove(COLLAPSED_CLASS);
    document.body.classList.add(SIDEBAR_OPEN_CLASS);
    return;
  }

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
    details.open = Boolean(q); // closed by default; automatically expands if there is an active search query

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

    summary.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      console.log('[swagg-spec] Header click detected:', {
        groupName: group.name,
        targetElement: target,
        isChevron: chevronSpan.contains(target)
      });
      if (chevronSpan.contains(target)) {
        console.log('[swagg-spec] Chevron clicked, skipping scroll');
        return;
      }
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
        row.dataset.method = op.method.toUpperCase();
        row.dataset.path = op.path;
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

  updateScrollSpy();
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

/* ─── Scrollspy Functions ────────────────────────────────────────── */

function determineActiveEndpoint(): void {
  if (isProgrammaticScrolling) return;

  if (visibleOpblocks.size === 0) {
    // If none are in the viewport, find the one closest to the top
    const opblocks = Array.from(document.querySelectorAll('.opblock'));
    let closest: Element | null = null;
    let closestDist = Infinity;

    opblocks.forEach((op) => {
      const rect = op.getBoundingClientRect();
      const dist = Math.abs(rect.top - 100);
      if (dist < closestDist) {
        closestDist = dist;
        closest = op;
      }
    });

    setActiveElement(closest);
    return;
  }

  // From the visible ones, pick the one closest to the top of the viewport
  let closest: Element | null = null;
  let closestTop = Infinity;

  visibleOpblocks.forEach((op) => {
    const rect = op.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < closestTop) {
      closestTop = rect.top;
      closest = op;
    }
  });

  if (closest) {
    setActiveElement(closest);
  }
}

function setActiveElement(opblock: Element | null): void {
  if (currentActiveOpblock === opblock) return;

  // Remove active class from previous opblock on the page
  if (currentActiveOpblock) {
    currentActiveOpblock.classList.remove('swagg-spec-opblock--active');
  }

  // Remove active class from all sidebar links
  const activeSidebarBtns = sidebarEl?.querySelectorAll('.swagg-spec-sidebar__endpoint--active');
  activeSidebarBtns?.forEach((btn) => {
    btn.classList.remove('swagg-spec-sidebar__endpoint--active');
  });

  currentActiveOpblock = opblock;

  if (!opblock) return;

  // Add active class to page element
  opblock.classList.add('swagg-spec-opblock--active');

  // Find parsed method/path
  const parsed = parseOperationFromDom(opblock);
  if (parsed) {
    const targetMethod = parsed.method.toUpperCase();
    const targetPath = normalizePath(parsed.path);
    const buttons = sidebarEl?.querySelectorAll<HTMLButtonElement>('.swagg-spec-sidebar__endpoint');
    const btn = Array.from(buttons ?? []).find((b) => {
      const bMethod = b.dataset.method;
      const bPath = b.dataset.path;
      return bMethod === targetMethod && bPath && normalizePath(bPath) === targetPath;
    });

    if (btn) {
      btn.classList.add('swagg-spec-sidebar__endpoint--active');

      // Scroll the sidebar button into view so it follows the scroll
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // Auto-expand the parent <details> tag if it is collapsed
      const details = btn.closest('details.swagg-spec-sidebar__group');
      if (details && !details.hasAttribute('open')) {
        details.setAttribute('open', '');
      }
    }
  }
}

export function updateScrollSpy(): void {
  // Disconnect existing observer if any
  if (activeObserver) {
    activeObserver.disconnect();
  }
  visibleOpblocks.clear();

  if (!sidebarEl) return;

  const opblocks = document.querySelectorAll('.opblock');
  if (opblocks.length === 0) return;

  activeObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          visibleOpblocks.add(entry.target);
        } else {
          visibleOpblocks.delete(entry.target);
        }
      });

      determineActiveEndpoint();
    },
    {
      root: null,
      rootMargin: '-80px 0px -60% 0px', // Focus on the upper-middle viewport
    }
  );

  opblocks.forEach((op) => {
    activeObserver?.observe(op);
  });

  // Run initial check
  determineActiveEndpoint();
}

