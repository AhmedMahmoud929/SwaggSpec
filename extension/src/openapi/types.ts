export interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string; description?: string };
  tags?: Tag[];
  paths?: Record<string, PathItem>;
  components?: Components;
  security?: SecurityRequirement[];
}

export interface Tag {
  name: string;
  description?: string;
}

export interface PathItem {
  parameters?: Parameter[];
  get?: Operation;
  put?: Operation;
  post?: Operation;
  delete?: Operation;
  patch?: Operation;
  head?: Operation;
  options?: Operation;
  trace?: Operation;
}

export interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated?: boolean;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, ResponseObject>;
  security?: SecurityRequirement[];
}

export interface Parameter {
  $ref?: string;
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, ExampleObject>;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
}

export interface MediaTypeObject {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, ExampleObject>;
}

export interface ResponseObject {
  $ref?: string;
  description: string;
  content?: Record<string, MediaTypeObject>;
  headers?: Record<string, unknown>;
}

export interface ExampleObject {
  summary?: string;
  description?: string;
  value?: unknown;
}

export interface SchemaObject {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  additionalProperties?: boolean | SchemaObject;
  description?: string;
  example?: unknown;
  default?: unknown;
  nullable?: boolean;
}

export interface Components {
  schemas?: Record<string, SchemaObject>;
  securitySchemes?: Record<string, SecurityScheme>;
  parameters?: Record<string, Parameter>;
  requestBodies?: Record<string, RequestBody>;
  responses?: Record<string, ResponseObject>;
}

export interface SecurityScheme {
  type: string;
  description?: string;
  name?: string;
  in?: string;
  scheme?: string;
  bearerFormat?: string;
  flows?: Record<string, unknown>;
}

export type SecurityRequirement = Record<string, string[]>;

export interface ResolvedOperation {
  method: string;
  path: string;
  operation: Operation;
  operationKey: string;
}

export const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'patch',
  'head',
  'options',
  'trace',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
