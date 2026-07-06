import type { OpenAPISpec, Operation, Parameter, ResolvedOperation } from '../openapi/types';
import { resolveSchema, simplifySchema } from '../openapi/ref-resolver';

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatExample(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getParameterExample(param: Parameter): string {
  if (param.example !== undefined) return formatExample(param.example);
  if (param.examples) {
    const first = Object.values(param.examples)[0];
    if (first?.value !== undefined) return formatExample(first.value);
  }
  if (param.schema?.example !== undefined) return formatExample(param.schema.example);
  if (param.schema?.enum?.length) return formatExample(param.schema.enum);
  return '';
}

function getSchemaType(param: Parameter): string {
  const schema = param.schema;
  if (!schema) return '';
  const parts: string[] = [];
  if (schema.type) parts.push(schema.type);
  if (schema.format) parts.push(`(${schema.format})`);
  if (!parts.length && schema.$ref) parts.push(schema.$ref.split('/').pop() ?? schema.$ref);
  if (schema.enum?.length) parts.push(`enum: ${schema.enum.join(', ')}`);
  return parts.join(' ');
}

function renderParameterTable(title: string, params: Parameter[]): string {
  if (!params.length) return '';

  const rows = params.map((param) => {
    const example = getParameterExample(param);
    return `| ${escapeTableCell(param.name)} | ${param.in} | ${escapeTableCell(getSchemaType(param))} | ${param.required ? 'yes' : 'no'} | ${escapeTableCell(param.description ?? '')} | ${example ? `\`${escapeTableCell(example)}\`` : ''} |`;
  });

  return `## ${title}

| Name | In | Type | Required | Description | Example |
|------|----|------|----------|-------------|---------|
${rows.join('\n')}
`;
}

function collectParameters(
  spec: OpenAPISpec,
  path: string,
  operation: Operation,
): { path: Parameter[]; query: Parameter[]; header: Parameter[]; cookie: Parameter[] } {
  const pathItem = spec.paths?.[path];
  const allParams = [...(pathItem?.parameters ?? []), ...(operation.parameters ?? [])];

  const resolved: Parameter[] = allParams.map((param) => {
    if (param.$ref) {
      const refName = param.$ref.split('/').pop();
      const resolvedParam = spec.components?.parameters?.[refName ?? ''];
      return resolvedParam ?? (param as Parameter);
    }
    return param;
  });

  const unique = new Map<string, Parameter>();
  for (const param of resolved) {
    unique.set(`${param.in}:${param.name}`, param);
  }

  const params = Array.from(unique.values());
  return {
    path: params.filter((p) => p.in === 'path'),
    query: params.filter((p) => p.in === 'query'),
    header: params.filter((p) => p.in === 'header'),
    cookie: params.filter((p) => p.in === 'cookie'),
  };
}

function renderSecurity(spec: OpenAPISpec, operation: Operation): string {
  const requirements = operation.security ?? spec.security;
  if (!requirements?.length) return '';

  const lines: string[] = [];
  for (const req of requirements) {
    for (const [schemeName] of Object.entries(req)) {
      const scheme = spec.components?.securitySchemes?.[schemeName];
      if (scheme) {
        const detail = [scheme.type, scheme.scheme, scheme.bearerFormat, scheme.name && scheme.in ? `${scheme.name} (${scheme.in})` : null]
          .filter(Boolean)
          .join(' / ');
        lines.push(`- ${schemeName} (${detail})`);
      } else {
        lines.push(`- ${schemeName}`);
      }
    }
  }

  if (!lines.length) return '';
  return `## Security

${lines.join('\n')}
`;
}

function renderRequestBody(spec: OpenAPISpec, operation: Operation): string {
  const body = operation.requestBody;
  if (!body?.content) return '';

  const sections: string[] = ['## Request Body', ''];

  if (body.description) {
    sections.push(body.description, '');
  }

  for (const [contentType, media] of Object.entries(body.content)) {
    sections.push(`**Content-Type:** \`${contentType}\``, '');

    if (media.schema) {
      const resolved = resolveSchema(spec, media.schema);
      const simplified = resolved ? simplifySchema(resolved) : media.schema;
      sections.push('### Schema', '', '```json', JSON.stringify(simplified, null, 2), '```', '');
    }

    const example =
      media.example ??
      (media.examples ? Object.values(media.examples)[0]?.value : undefined);

    if (example !== undefined) {
      sections.push('### Example', '', '```json', formatExample(example), '```', '');
    }
  }

  return sections.join('\n').trim() + '\n';
}

function renderResponses(spec: OpenAPISpec, operation: Operation): string {
  const responses = operation.responses;
  if (!responses || !Object.keys(responses).length) return '';

  const sections: string[] = ['## Responses', ''];

  for (const [statusCode, response] of Object.entries(responses)) {
    let resolvedResponse = response;
    if (response.$ref) {
      const refName = response.$ref.split('/').pop();
      resolvedResponse = spec.components?.responses?.[refName ?? ''] ?? response;
    }

    sections.push(`### ${statusCode} ${resolvedResponse.description ?? ''}`, '');

    if (resolvedResponse.content) {
      for (const [contentType, media] of Object.entries(resolvedResponse.content)) {
        sections.push(`**Content-Type:** \`${contentType}\``, '');

        if (media.schema) {
          const resolved = resolveSchema(spec, media.schema);
          const simplified = resolved ? simplifySchema(resolved) : media.schema;
          sections.push('```json', JSON.stringify(simplified, null, 2), '```', '');
        }

        const example =
          media.example ??
          (media.examples ? Object.values(media.examples)[0]?.value : undefined);

        if (example !== undefined) {
          sections.push('```json', formatExample(example), '```', '');
        }
      }
    }

    sections.push('');
  }

  return sections.join('\n').trim() + '\n';
}

export function buildEndpointMarkdown(spec: OpenAPISpec, resolved: ResolvedOperation): string {
  const { method, path, operation } = resolved;
  const title =
    operation.summary ??
    operation.operationId ??
    `${method} ${path}`;

  const params = collectParameters(spec, path, operation);

  const overviewRows = [
    `| Method | \`${method}\` |`,
    `| Path | \`${path}\` |`,
  ];

  if (operation.operationId) {
    overviewRows.push(`| Operation ID | \`${operation.operationId}\` |`);
  }

  if (operation.tags?.length) {
    overviewRows.push(`| Tags | ${operation.tags.map((t) => `\`${t}\``).join(', ')} |`);
  }

  if (operation.deprecated) {
    overviewRows.push('| Deprecated | `true` |');
  } else {
    overviewRows.push('| Deprecated | `false` |');
  }

  const sections: string[] = [
    `# ${title}`,
    '',
    '## Overview',
    '',
    '| Field | Value |',
    '|-------|-------|',
    ...overviewRows,
    '',
  ];

  if (operation.description) {
    sections.push('## Description', '', operation.description, '');
  }

  const security = renderSecurity(spec, operation);
  if (security) sections.push(security, '');

  if (params.path.length) sections.push(renderParameterTable('Path Parameters', params.path), '');
  if (params.query.length) sections.push(renderParameterTable('Query Parameters', params.query), '');
  if (params.header.length) sections.push(renderParameterTable('Header Parameters', params.header), '');
  if (params.cookie.length) sections.push(renderParameterTable('Cookie Parameters', params.cookie), '');

  const requestBody = renderRequestBody(spec, operation);
  if (requestBody) sections.push(requestBody, '');

  const responses = renderResponses(spec, operation);
  if (responses) sections.push(responses, '');

  return sections.join('\n').trim();
}

export function buildEndpointMarkdownFromDom(opblock: Element): string {
  const method =
    opblock.querySelector('.opblock-summary-method')?.textContent?.trim().toUpperCase() ?? 'UNKNOWN';
  const path =
    opblock.querySelector('.opblock-summary-path')?.textContent?.trim() ??
    opblock.querySelector('.opblock-summary-path__deprecated')?.textContent?.trim() ??
    'UNKNOWN';
  const summary =
    opblock.querySelector('.opblock-summary-description')?.textContent?.trim() ?? '';

  const sections: string[] = [
    `# ${summary || `${method} ${path}`}`,
    '',
    '## Overview',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| Method | \`${method}\` |`,
    `| Path | \`${path}\` |`,
    '',
    '> Note: OpenAPI spec was not available. This markdown was generated from the visible Swagger UI DOM.',
    '',
  ];

  const table = opblock.querySelector('table.parameters');
  if (table) {
    sections.push('## Parameters', '', domTableToMarkdown(table), '');
  }

  const bodySection = opblock.querySelector('.body-param__text, .model-box');
  if (bodySection?.textContent?.trim()) {
    sections.push('## Request Body', '', '```', bodySection.textContent.trim(), '```', '');
  }

  const responseSection = opblock.querySelector('.responses-inner, .responses-table');
  if (responseSection?.textContent?.trim()) {
    sections.push('## Responses', '', '```', responseSection.textContent.trim(), '```', '');
  }

  return sections.join('\n').trim();
}

function domTableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';

  const data = rows.map((row) =>
    Array.from(row.querySelectorAll('th, td')).map((cell) =>
      escapeTableCell(cell.textContent?.trim() ?? ''),
    ),
  );

  if (data.length < 2) return data.map((r) => r.join(' | ')).join('\n');

  const header = data[0];
  const separator = header.map(() => '---');
  const body = data.slice(1);

  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}
