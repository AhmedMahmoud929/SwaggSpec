import type { HttpMethod, OpenAPISpec } from './types';
import { isOpenAPISpec } from './spec-utils';

export interface InitScriptConfig {
  spec?: OpenAPISpec;
  url?: string;
  urls?: Array<{ url: string; name?: string }>;
  configUrl?: string;
}

export function discoverInitScriptUrls(doc: Document = document): string[] {
  const urls = new Set<string>();

  for (const script of doc.querySelectorAll('script[src]')) {
    const src = script.getAttribute('src');
    if (!src?.includes('swagger-ui-init')) continue;
    urls.add(new URL(src, location.href).href);
  }

  const candidates = [
    'swagger-ui-init.js',
    './swagger-ui-init.js',
    '../swagger-ui-init.js',
    '/swagger-ui/swagger-ui-init.js',
    '/swagger-ui-init.js',
  ];

  for (const candidate of candidates) {
    try {
      urls.add(new URL(candidate, location.href).href);
    } catch {
      // ignore invalid URL
    }
  }

  return Array.from(urls);
}

export function parseInitScriptSource(source: string): InitScriptConfig {
  const config: InitScriptConfig = {};

  const spec = extractInlineSpec(source);
  if (spec) config.spec = spec;

  const url =
    matchQuotedAssignment(source, 'url') ??
    matchQuotedAssignment(source, 'swaggerUrl') ??
    matchQuotedAssignment(source, 'specUrl');

  if (url) config.url = url;

  const configUrl = matchQuotedAssignment(source, 'configUrl');
  if (configUrl) config.configUrl = configUrl;

  const urls = extractUrlsArray(source);
  if (urls.length) config.urls = urls;

  return config;
}

function matchQuotedAssignment(source: string, key: string): string | undefined {
  const pattern = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`);
  return pattern.exec(source)?.[1];
}

function extractUrlsArray(source: string): Array<{ url: string; name?: string }> {
  const match = /["']?urls["']?\s*:\s*\[/.exec(source);
  if (!match) return [];

  const start = match.index + match[0].length - 1;
  const arrayText = extractBalanced(source, start, '[', ']');
  if (!arrayText) return [];

  const results: Array<{ url: string; name?: string }> = [];
  const entryPattern = /\{\s*["']?url["']?\s*:\s*["']([^"']+)["'](?:\s*,\s*["']?name["']?\s*:\s*["']([^"']+)["'])?/g;

  for (const entry of arrayText.matchAll(entryPattern)) {
    results.push({ url: entry[1], name: entry[2] });
  }

  return results;
}

function extractInlineSpec(source: string): OpenAPISpec | undefined {
  for (const key of ['swaggerDoc', 'spec']) {
    const pattern = new RegExp(`["']?${key}["']?\\s*[:=]\\s*\\{`);
    const match = pattern.exec(source);
    if (!match) continue;

    const start = match.index + match[0].length - 1;
    const objectText = extractBalanced(source, start, '{', '}');
    if (!objectText) continue;

    const parsed = parseJsObjectLiteral(objectText);
    if (parsed && isOpenAPISpec(parsed)) {
      return parsed;
    }
  }

  const jsonParseMatch = /JSON\.parse\(\s*(['"`])([\s\S]*?)\1\s*\)/.exec(source);
  if (jsonParseMatch) {
    try {
      const decoded = jsonParseMatch[1] === "'"
        ? jsonParseMatch[2]
        : JSON.parse(`"${jsonParseMatch[2].replace(/"/g, '\\"')}"`);
      const parsed = JSON.parse(decoded) as unknown;
      if (isOpenAPISpec(parsed)) return parsed;
    } catch {
      // ignore
    }
  }

  return undefined;
}

function extractBalanced(
  source: string,
  start: number,
  open: string,
  close: string,
): string | null {
  if (source[start] !== open) return null;

  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }

    if (char === open) depth++;
    if (char === close) {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseJsObjectLiteral(objectText: string): unknown {
  try {
    return JSON.parse(objectText) as unknown;
  } catch {
    // JS object literals may use unquoted keys
  }

  try {
    // Content script only evaluates swagger init on the active page.
    return new Function(`return (${objectText});`)() as unknown;
  } catch {
    return null;
  }
}

export async function fetchSwaggerConfig(
  configUrl: string,
): Promise<{ url?: string; urls?: Array<{ url: string; name?: string }> } | null> {
  try {
    const response = await fetch(new URL(configUrl, location.href).href);
    if (!response.ok) return null;
    const json = (await response.json()) as {
      url?: string;
      urls?: Array<{ url: string; name?: string }>;
    };
    return json;
  } catch {
    return null;
  }
}

export async function fetchSpecFromUrl(url: string): Promise<OpenAPISpec | null> {
  try {
    const absolute = new URL(url, location.href).href;
    const response = await fetch(absolute);
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (
      contentType.includes('yaml') ||
      absolute.endsWith('.yaml') ||
      absolute.endsWith('.yml')
    ) {
      return null;
    }

    const parsed = (await response.json()) as unknown;
    return isOpenAPISpec(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function resolveFromSwaggerInitScript(
  doc: Document = document,
): Promise<OpenAPISpec | null> {
  const initUrls = discoverInitScriptUrls(doc);

  for (const initUrl of initUrls) {
    let source: string;
    try {
      const response = await fetch(initUrl);
      if (!response.ok) continue;
      source = await response.text();
    } catch {
      continue;
    }

    const config = parseInitScriptSource(source);
    if (config.spec) return config.spec;

    if (config.configUrl) {
      const swaggerConfig = await fetchSwaggerConfig(config.configUrl);
      if (swaggerConfig?.url) {
        const spec = await fetchSpecFromUrl(swaggerConfig.url);
        if (spec) return spec;
      }
      if (swaggerConfig?.urls?.length) {
        for (const entry of swaggerConfig.urls) {
          const spec = await fetchSpecFromUrl(entry.url);
          if (spec) return spec;
        }
      }
    }

    if (config.url) {
      const spec = await fetchSpecFromUrl(config.url);
      if (spec) return spec;
    }

    if (config.urls?.length) {
      for (const entry of config.urls) {
        const spec = await fetchSpecFromUrl(entry.url);
        if (spec) return spec;
      }
    }
  }

  return null;
}

export async function resolveSpecForOperation(
  method: string,
  path: string,
  doc: Document = document,
): Promise<OpenAPISpec | null> {
  const initUrls = discoverInitScriptUrls(doc);

  for (const initUrl of initUrls) {
    let source: string;
    try {
      const response = await fetch(initUrl);
      if (!response.ok) continue;
      source = await response.text();
    } catch {
      continue;
    }

    const config = parseInitScriptSource(source);
    const candidateUrls: string[] = [];

    if (config.url) candidateUrls.push(config.url);

    if (config.configUrl) {
      const swaggerConfig = await fetchSwaggerConfig(config.configUrl);
      if (swaggerConfig?.url) candidateUrls.push(swaggerConfig.url);
      if (swaggerConfig?.urls) {
        candidateUrls.push(...swaggerConfig.urls.map((entry) => entry.url));
      }
    }

    if (config.urls) {
      candidateUrls.push(...config.urls.map((entry) => entry.url));
    }

    for (const specUrl of candidateUrls) {
      const spec = await fetchSpecFromUrl(specUrl);
      if (spec && specContainsOperation(spec, method, path)) {
        return spec;
      }
    }
  }

  return null;
}

function specContainsOperation(spec: OpenAPISpec, method: string, path: string): boolean {
  const normalizedMethod = method.toLowerCase() as HttpMethod;

  for (const [specPath, pathItem] of Object.entries(spec.paths ?? {})) {
    const operation = pathItem[normalizedMethod];
    if (!operation) continue;

    if (
      path === specPath ||
      path.endsWith(specPath) ||
      specPath.endsWith(path) ||
      path.includes(specPath)
    ) {
      return true;
    }
  }

  return false;
}
