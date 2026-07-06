import type { HttpMethod, OpenAPISpec, Operation, ResolvedOperation } from './types';
import { HTTP_METHODS } from './types';

interface SwaggerUIWindow extends Window {
  ui?: {
    getConfigs?: () => { spec?: OpenAPISpec; url?: string };
    specSelectors?: {
      specJson?: () => OpenAPISpec;
      url?: () => string;
    };
    getState?: () => { spec?: { json?: OpenAPISpec } };
  };
  swaggerUi?: {
    getConfigs?: () => { spec?: OpenAPISpec; url?: string };
  };
}

let cachedSpec: OpenAPISpec | null = null;
let cachePromise: Promise<OpenAPISpec | null> | null = null;

export function clearSpecCache(): void {
  cachedSpec = null;
  cachePromise = null;
}

export async function resolveOpenAPISpec(doc: Document = document): Promise<OpenAPISpec | null> {
  if (cachedSpec) return cachedSpec;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    const spec =
      resolveFromSwaggerUI() ??
      resolveFromEmbeddedScript(doc) ??
      (await resolveFromSpecUrl()) ??
      null;

    cachedSpec = spec;
    return spec;
  })();

  return cachePromise;
}

function resolveFromSwaggerUI(): OpenAPISpec | null {
  const win = window as SwaggerUIWindow;

  try {
    const configs = win.ui?.getConfigs?.();
    if (configs?.spec && isOpenAPISpec(configs.spec)) {
      return configs.spec;
    }
  } catch {
    // ignore
  }

  try {
    const specJson = win.ui?.specSelectors?.specJson?.();
    if (specJson && isOpenAPISpec(specJson)) {
      return specJson;
    }
  } catch {
    // ignore
  }

  try {
    const stateSpec = win.ui?.getState?.()?.spec?.json;
    if (stateSpec && isOpenAPISpec(stateSpec)) {
      return stateSpec;
    }
  } catch {
    // ignore
  }

  try {
    const legacyConfigs = win.swaggerUi?.getConfigs?.();
    if (legacyConfigs?.spec && isOpenAPISpec(legacyConfigs.spec)) {
      return legacyConfigs.spec;
    }
  } catch {
    // ignore
  }

  return null;
}

function resolveFromEmbeddedScript(doc: Document): OpenAPISpec | null {
  const scripts = doc.querySelectorAll('script:not([src])');

  for (const script of scripts) {
    const text = script.textContent?.trim();
    if (!text) continue;

    if (!text.includes('"paths"') && !text.includes("'paths'")) continue;

    try {
      const parsed = JSON.parse(text) as unknown;
      if (isOpenAPISpec(parsed)) return parsed;
    } catch {
      // not JSON
    }

    const specMatch = text.match(/spec\s*:\s*(\{[\s\S]*\})\s*,?\s*(?:url|dom_id|presets)/);
    if (specMatch) {
      try {
        const parsed = JSON.parse(specMatch[1]) as unknown;
        if (isOpenAPISpec(parsed)) return parsed;
      } catch {
        // ignore
      }
    }
  }

  return null;
}

async function resolveFromSpecUrl(): Promise<OpenAPISpec | null> {
  const win = window as SwaggerUIWindow;
  const url = win.ui?.getConfigs?.()?.url ?? win.ui?.specSelectors?.url?.();

  if (!url || typeof url !== 'string') return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('yaml') || url.endsWith('.yaml') || url.endsWith('.yml')) {
      return null;
    }

    const parsed = (await response.json()) as unknown;
    return isOpenAPISpec(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isOpenAPISpec(value: unknown): value is OpenAPISpec {
  if (!value || typeof value !== 'object') return false;
  const obj = value as OpenAPISpec;
  return Boolean(obj.paths && typeof obj.paths === 'object');
}

export function getAllOperations(spec: OpenAPISpec): ResolvedOperation[] {
  const operations: ResolvedOperation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      operations.push({
        method: method.toUpperCase(),
        path,
        operation,
        operationKey: operation.operationId ?? `${method.toUpperCase()}:${path}`,
      });
    }
  }

  return operations;
}

export function getOperationsForTag(spec: OpenAPISpec, tagName: string): ResolvedOperation[] {
  return getAllOperations(spec).filter((op) => op.operation.tags?.includes(tagName));
}

export function findOperation(
  spec: OpenAPISpec,
  method: string,
  path: string,
): ResolvedOperation | null {
  const normalizedMethod = method.toLowerCase() as HttpMethod;
  const pathItem = spec.paths?.[path];
  if (!pathItem) return null;

  const operation = pathItem[normalizedMethod];
  if (!operation) return null;

  return {
    method: method.toUpperCase(),
    path,
    operation,
    operationKey: operation.operationId ?? `${method.toUpperCase()}:${path}`,
  };
}

export function getTagDescription(spec: OpenAPISpec, tagName: string): string | undefined {
  return spec.tags?.find((t) => t.name === tagName)?.description;
}

export function parseOperationFromDom(opblock: Element): { method: string; path: string } | null {
  const methodEl =
    opblock.querySelector('.opblock-summary-method') ??
    opblock.querySelector('[class*="opblock-summary-method"]');
  const pathEl =
    opblock.querySelector('.opblock-summary-path') ??
    opblock.querySelector('.opblock-summary-path__deprecated') ??
    opblock.querySelector('a.nostyle span');

  const method = methodEl?.textContent?.trim().toUpperCase();
  let path = pathEl?.textContent?.trim();

  if (!method || !path) {
    const classList = Array.from(opblock.classList);
    const methodClass = classList.find((c) => c.startsWith('opblock-') && c !== 'opblock');
    if (methodClass) {
      const derivedMethod = methodClass.replace('opblock-', '').toUpperCase();
      if (derivedMethod && derivedMethod !== 'ISOPEN') {
        const pathAnchor = opblock.querySelector('.opblock-summary-path, a');
        const derivedPath = pathAnchor?.textContent?.trim();
        if (derivedPath) {
          return { method: derivedMethod, path: derivedPath };
        }
      }
    }
    return null;
  }

  return { method, path };
}

export function parseTagFromDom(section: Element): string | null {
  const tagEl =
    section.querySelector('.opblock-tag') ??
    section.querySelector('[data-tag]') ??
    section.querySelector('h3 span, h4 span');

  const tagText = tagEl?.textContent?.trim();
  if (!tagText) return null;

  return tagText.replace(/\s*\d+\s*$/, '').trim();
}

export function isSwaggerPage(doc: Document = document): boolean {
  if (resolveFromSwaggerUI()) return true;

  return Boolean(
    doc.querySelector('.swagger-ui') ??
      doc.querySelector('#swagger-ui') ??
      doc.querySelector('.opblock-tag-section') ??
      doc.querySelector('.opblock'),
  );
}
