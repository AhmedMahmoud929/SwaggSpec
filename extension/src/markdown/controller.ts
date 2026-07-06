import type { OpenAPISpec } from '../openapi/types';
import { getOperationsForTag, getTagDescription } from '../openapi/resolver';
import { buildEndpointMarkdown } from './endpoint';

export function buildControllerMarkdown(spec: OpenAPISpec, tagName: string): string {
  const operations = getOperationsForTag(spec, tagName);
  const description = getTagDescription(spec, tagName);

  const sections: string[] = [`# Controller: ${tagName}`, ''];

  if (description) {
    sections.push(`> ${description}`, '');
  }

  if (!operations.length) {
    sections.push('_No operations found for this controller._');
    return sections.join('\n').trim();
  }

  operations.forEach((op, index) => {
    if (index > 0) sections.push('---', '');
    sections.push(buildEndpointMarkdown(spec, op));
  });

  return sections.join('\n').trim();
}

export function buildControllerMarkdownFromDom(
  tagName: string,
  opblocks: Element[],
): string {
  const sections: string[] = [`# Controller: ${tagName}`, '', ''];

  if (!opblocks.length) {
    sections.push('_No visible operations for this controller._');
    return sections.join('\n').trim();
  }

  opblocks.forEach((block, index) => {
    if (index > 0) sections.push('---', '');

    const method =
      block.querySelector('.opblock-summary-method')?.textContent?.trim().toUpperCase() ?? 'UNKNOWN';
    const path =
      block.querySelector('.opblock-summary-path')?.textContent?.trim() ??
      block.querySelector('.opblock-summary-path__deprecated')?.textContent?.trim() ??
      'UNKNOWN';
    const summary =
      block.querySelector('.opblock-summary-description')?.textContent?.trim() ?? '';

    sections.push(
      `# ${summary || `${method} ${path}`}`,
      '',
      '## Overview',
      '',
      '| Field | Value |',
      '|-------|-------|',
      `| Method | \`${method}\` |`,
      `| Path | \`${path}\` |`,
      '',
    );
  });

  sections.push(
    '',
    '> Note: OpenAPI spec was not available. This markdown was generated from visible Swagger UI operations.',
  );

  return sections.join('\n').trim();
}
