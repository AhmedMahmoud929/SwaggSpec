import type { OpenAPISpec, SchemaObject } from './types';

export function resolveRef(spec: OpenAPISpec, ref: string, depth = 0): SchemaObject | undefined {
  if (depth > 10) return undefined;
  if (!ref.startsWith('#/')) return undefined;

  const parts = ref.slice(2).split('/');
  let current: unknown = spec;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }

  if (current == null || typeof current !== 'object') return undefined;

  const schema = current as SchemaObject;
  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref, depth + 1);
    return resolved ?? schema;
  }

  return schema;
}

export function resolveSchema(spec: OpenAPISpec, schema?: SchemaObject, depth = 0): SchemaObject | undefined {
  if (!schema || depth > 10) return schema;

  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref, depth);
    if (!resolved) return { $ref: schema.$ref };
    return resolveSchema(spec, resolved, depth + 1);
  }

  const result: SchemaObject = { ...schema };

  if (schema.allOf) {
    result.allOf = schema.allOf.map((s) => resolveSchema(spec, s, depth + 1) ?? s);
  }
  if (schema.oneOf) {
    result.oneOf = schema.oneOf.map((s) => resolveSchema(spec, s, depth + 1) ?? s);
  }
  if (schema.anyOf) {
    result.anyOf = schema.anyOf.map((s) => resolveSchema(spec, s, depth + 1) ?? s);
  }
  if (schema.items) {
    result.items = resolveSchema(spec, schema.items, depth + 1) ?? schema.items;
  }
  if (schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = resolveSchema(spec, value, depth + 1) ?? value;
    }
  }

  return result;
}

export function simplifySchema(schema: SchemaObject): unknown {
  if (schema.allOf?.length) {
    const merged: Record<string, unknown> = { type: 'object', properties: {} };
    for (const part of schema.allOf) {
      const simplified = simplifySchema(part);
      if (simplified && typeof simplified === 'object' && !Array.isArray(simplified)) {
        const obj = simplified as Record<string, unknown>;
        if (obj.properties && typeof obj.properties === 'object') {
          Object.assign(merged.properties as Record<string, unknown>, obj.properties);
        }
        if (obj.type) merged.type = obj.type;
        if (obj.required) merged.required = obj.required;
      }
    }
    return merged;
  }

  if (schema.oneOf?.length) {
    return { oneOf: schema.oneOf.map(simplifySchema) };
  }

  if (schema.anyOf?.length) {
    return { anyOf: schema.anyOf.map(simplifySchema) };
  }

  const result: Record<string, unknown> = {};

  if (schema.type) result.type = schema.type;
  if (schema.format) result.format = schema.format;
  if (schema.description) result.description = schema.description;
  if (schema.nullable) result.nullable = schema.nullable;
  if (schema.enum) result.enum = schema.enum;
  if (schema.example !== undefined) result.example = schema.example;

  if (schema.type === 'array' && schema.items) {
    result.items = simplifySchema(schema.items);
  }

  if (schema.properties) {
    result.type = result.type ?? 'object';
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      (result.properties as Record<string, unknown>)[key] = simplifySchema(value);
    }
    if (schema.required?.length) {
      result.required = schema.required;
    }
  }

  if (schema.$ref) {
    return { $ref: schema.$ref };
  }

  return Object.keys(result).length > 0 ? result : schema;
}
