import type { OpenAPISpec } from './types';

export function isOpenAPISpec(value: unknown): value is OpenAPISpec {
  if (!value || typeof value !== 'object') return false;
  const obj = value as OpenAPISpec;
  return Boolean(obj.paths && typeof obj.paths === 'object');
}
