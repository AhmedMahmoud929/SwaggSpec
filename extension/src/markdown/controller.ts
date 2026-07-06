import type { OpenAPISpec } from '../openapi/types';
import { getOperationsForTag, getTagDescription, parseOperationFromDom } from '../openapi/resolver';
import { buildEndpointMarkdown } from './endpoint';

function mapOpblocks(opblocks: Element[]): Map<string, Element> {
  const map = new Map<string, Element>();
  for (const block of opblocks) {
    const parsed = parseOperationFromDom(block);
    if (parsed) {
      map.set(`${parsed.method}:${parsed.path}`, block);
    }
  }
  return map;
}

export function buildControllerMarkdown(
  spec: OpenAPISpec,
  tagName: string,
  opblocks: Element[] = [],
): string {
  const operations = getOperationsForTag(spec, tagName);
  const description = getTagDescription(spec, tagName);
  const opblockMap = mapOpblocks(opblocks);

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

    const exactKey = `${op.method}:${op.path}`;
    let opblock = opblockMap.get(exactKey);
    let displayPath = op.path;

    if (!opblock) {
      for (const [key, block] of opblockMap.entries()) {
        if (key.startsWith(`${op.method}:`) && key.endsWith(op.path)) {
          opblock = block;
          displayPath = key.slice(op.method.length + 1);
          break;
        }
      }
    } else {
      displayPath = exactKey.slice(op.method.length + 1);
    }

    sections.push(buildEndpointMarkdown(spec, op, { opblock, displayPath }));
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
