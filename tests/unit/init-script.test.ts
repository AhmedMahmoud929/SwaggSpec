import { describe, expect, it } from 'vitest';
import { parseInitScriptSource } from '../../extension/src/openapi/init-script';

describe('parseInitScriptSource', () => {
  it('extracts api docs url from springdoc style init script', () => {
    const source = `
      window.onload = function() {
        window.ui = SwaggerUIBundle({
          configUrl: "/v3/api-docs/swagger-config",
          url: "/v3/api-docs",
          dom_id: '#swagger-ui'
        });
      };
    `;

    const config = parseInitScriptSource(source);

    expect(config.configUrl).toBe('/v3/api-docs/swagger-config');
    expect(config.url).toBe('/v3/api-docs');
  });

  it('extracts grouped urls from init script', () => {
    const source = `
      window.ui = SwaggerUIBundle({
        urls: [
          { url: "/v3/api-docs/Customers", name: "Customers" },
          { url: "/v3/api-docs/Wallets", name: "Wallets" }
        ]
      });
    `;

    const config = parseInitScriptSource(source);

    expect(config.urls).toEqual([
      { url: '/v3/api-docs/Customers', name: 'Customers' },
      { url: '/v3/api-docs/Wallets', name: 'Wallets' },
    ]);
  });

  it('extracts inline swaggerDoc object', () => {
    const source = `
      var options = {};
      options.swaggerDoc = {
        "openapi": "3.0.1",
        "paths": {
          "/pets": {
            "get": { "responses": { "200": { "description": "ok" } } }
          }
        }
      };
    `;

    const config = parseInitScriptSource(source);

    expect(config.spec?.openapi).toBe('3.0.1');
    expect(config.spec?.paths?.['/pets']).toBeDefined();
  });
});
