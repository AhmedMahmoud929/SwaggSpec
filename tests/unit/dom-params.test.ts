/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { buildExampleRequestUrl, domValueKey, parseDomParameterValues } from '../../extension/src/openapi/dom-params';

describe('dom-params', () => {
  it('reads filled parameter inputs from swagger rows', () => {
    document.body.innerHTML = `
      <div class="opblock">
        <table class="parameters">
          <tbody>
            <tr data-param-name="page" data-param-in="query">
              <td class="parameters-col_name"><span class="parameter__name">page</span></td>
              <td class="parameters-col_model"><input value="1" /></td>
            </tr>
            <tr data-param-name="search" data-param-in="query">
              <td class="parameters-col_name"><span class="parameter__name">search</span></td>
              <td class="parameters-col_model"><input value="Sara" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const opblock = document.querySelector('.opblock')!;
    const values = parseDomParameterValues(opblock);

    expect(values).toEqual([
      { name: 'page', in: 'query', value: '1' },
      { name: 'search', in: 'query', value: 'Sara' },
    ]);
  });

  it('builds an example request url', () => {
    const url = buildExampleRequestUrl('GET', '/api/v1/products/{productId}/reviews', [
      { name: 'productId', in: 'path', value: 'd012d9c4-a5e2-45e0-9bc6-e265c026da6a' },
      { name: 'page', in: 'query', value: '1' },
      { name: 'rating', in: 'query', value: '5' },
    ]);

    expect(url).toBe(
      'GET /api/v1/products/d012d9c4-a5e2-45e0-9bc6-e265c026da6a/reviews?page=1&rating=5',
    );
  });

  it('creates stable dom value keys', () => {
    expect(domValueKey('page', 'query')).toBe('query:page');
  });
});
