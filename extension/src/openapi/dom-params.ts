export interface DomParameterValue {
  name: string;
  in: string;
  value: string;
}

function readInputValue(el: Element): string {
  if (el instanceof HTMLSelectElement) {
    return el.value;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value;
  }
  return el.textContent?.trim() ?? '';
}

function parseParameterRow(row: Element): DomParameterValue | null {
  const name = row.getAttribute('data-param-name');
  const paramIn = row.getAttribute('data-param-in') ?? 'query';

  if (name) {
    const input =
      row.querySelector('input, select, textarea') ??
      row.querySelector('.parameters-col_model input, .parameters-col_model select, .parameters-col_model textarea');

    if (input) {
      const value = readInputValue(input);
      if (value) return { name, in: paramIn, value };
    }
  }

  const nameCell = row.querySelector('.parameters-col_name .parameter__name, .parameter__name');
  const paramName = nameCell?.textContent?.trim().replace(/\s+/g, ' ');
  if (!paramName) return null;

  const input = row.querySelector('input, select, textarea');
  if (!input) return null;

  const value = readInputValue(input);
  if (!value) return null;

  const inBadge = row.querySelector('.parameter__in, .parameters-col_name .parameter__in');
  const inferredIn = inBadge?.textContent?.trim().toLowerCase() ?? paramIn;

  return { name: paramName, in: inferredIn, value };
}

export function parseDomParameterValues(opblock: Element): DomParameterValue[] {
  const results: DomParameterValue[] = [];
  const seen = new Set<string>();

  const rows = opblock.querySelectorAll(
    'tr[data-param-name], table.parameters tbody tr, .parameters-container tr, .opblock-section .table-container tr',
  );

  for (const row of rows) {
    const parsed = parseParameterRow(row);
    if (!parsed) continue;

    const key = `${parsed.in}:${parsed.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(parsed);
  }

  return results;
}

export function domValueKey(name: string, paramIn: string): string {
  return `${paramIn}:${name}`;
}

export function buildExampleRequestUrl(
  method: string,
  path: string,
  params: DomParameterValue[],
): string | null {
  let url = path;
  const queryParts: string[] = [];

  for (const param of params) {
    if (param.in === 'path') {
      url = url.replace(`{${param.name}}`, encodeURIComponent(param.value));
    } else if (param.in === 'query') {
      queryParts.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(param.value)}`);
    }
  }

  if (!queryParts.length && url === path) return null;

  const query = queryParts.length ? `?${queryParts.join('&')}` : '';
  return `${method.toUpperCase()} ${url}${query}`;
}
