/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { buildControllerMarkdown } from '../../extension/src/markdown/controller';
import { buildEndpointMarkdown } from '../../extension/src/markdown/endpoint';
import { findOperation, getAllOperations, getOperationsForTag, isOpenAPISpec } from '../../extension/src/openapi/resolver';
import { resolveSchema, simplifySchema } from '../../extension/src/openapi/ref-resolver';
import type { OpenAPISpec } from '../../extension/src/openapi/types';

const petstore = JSON.parse(
  readFileSync(resolve(__dirname, '../../fixtures/petstore.openapi.json'), 'utf-8'),
) as OpenAPISpec;

describe('isOpenAPISpec', () => {
  it('identifies valid OpenAPI specs', () => {
    expect(isOpenAPISpec(petstore)).toBe(true);
    expect(isOpenAPISpec({})).toBe(false);
    expect(isOpenAPISpec(null)).toBe(false);
  });
});

describe('resolver helpers', () => {
  it('lists all operations', () => {
    expect(getAllOperations(petstore)).toHaveLength(3);
  });

  it('filters operations by tag', () => {
    const pets = getOperationsForTag(petstore, 'pets');
    expect(pets).toHaveLength(3);
    expect(pets.map((o) => o.operation.operationId)).toEqual([
      'listPets',
      'createPet',
      'getPetById',
    ]);
  });

  it('finds operation by method and path', () => {
    const op = findOperation(petstore, 'GET', '/pets/{petId}');
    expect(op?.operation.operationId).toBe('getPetById');
  });
});

describe('ref-resolver', () => {
  it('resolves schema refs', () => {
    const op = findOperation(petstore, 'POST', '/pets');
    const schema = op?.operation.requestBody?.content?.['application/json']?.schema;
    const resolved = resolveSchema(petstore, schema);
    expect(resolved?.properties?.name?.type).toBe('string');
  });

  it('simplifies merged schemas', () => {
    const schema = resolveSchema(petstore, petstore.components?.schemas?.Pet);
    const simplified = simplifySchema(schema!);
    expect(simplified).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    });
  });
});

describe('buildEndpointMarkdown', () => {
  it('includes method, path, and parameters', () => {
    const op = findOperation(petstore, 'GET', '/pets/{petId}')!;
    const md = buildEndpointMarkdown(petstore, op);

    expect(md).toContain('# Get pet by ID');
    expect(md).toContain('`GET`');
    expect(md).toContain('`/pets/{petId}`');
    expect(md).toContain('## Path Parameters');
    expect(md).toContain('petId');
    expect(md).toContain('| Deprecated | `true` |');
  });

  it('includes request body example', () => {
    const op = findOperation(petstore, 'POST', '/pets')!;
    const md = buildEndpointMarkdown(petstore, op);

    expect(md).toContain('## Request Body');
    expect(md).toContain('### Example');
    expect(md).toContain('"name": "Fluffy"');
  });

  it('omits request body when absent', () => {
    const op = findOperation(petstore, 'GET', '/pets')!;
    const md = buildEndpointMarkdown(petstore, op);

    expect(md).not.toContain('## Request Body');
  });

  it('includes security schemes', () => {
    const op = findOperation(petstore, 'GET', '/pets')!;
    const md = buildEndpointMarkdown(petstore, op);

    expect(md).toContain('## Security');
    expect(md).toContain('bearerAuth');
  });

  it('includes schema default as example fallback', () => {
    const specWithDefault = {
      ...petstore,
      paths: {
        '/pets': {
          get: {
            tags: ['pets'],
            summary: 'List pets',
            parameters: [
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', default: 10 },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    } as OpenAPISpec;

    const op = findOperation(specWithDefault, 'GET', '/pets')!;
    const md = buildEndpointMarkdown(specWithDefault, op);

    expect(md).toContain('`10`');
  });

  it('merges filled swagger ui values into parameter examples', () => {
    document.body.innerHTML = `
      <div class="opblock">
        <table class="parameters">
          <tbody>
            <tr data-param-name="limit" data-param-in="query">
              <td class="parameters-col_model"><input value="25" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const op = findOperation(petstore, 'GET', '/pets')!;
    const opblock = document.querySelector('.opblock')!;
    const md = buildEndpointMarkdown(petstore, op, { opblock });

    expect(md).toContain('`25`');
    expect(md).toContain('## Example Request');
  });
});

describe('buildControllerMarkdown', () => {
  it('includes all tag operations', () => {
    const md = buildControllerMarkdown(petstore, 'pets');

    expect(md).toContain('# Controller: pets');
    expect(md).toContain('> Pet operations');
    expect(md).toContain('# List pets');
    expect(md).toContain('# Create a pet');
    expect(md).toContain('# Get pet by ID');
    expect(md).toContain('---');
  });
});
