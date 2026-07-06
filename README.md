# Swagger Spec Copy

Chrome extension that adds **Copy Controller** and **Copy Endpoint** buttons to Swagger UI pages. Copied content is structured Markdown designed for AI coding agents.

## Features

- Copy a single endpoint with method, path, parameters, request body, responses, security, and examples
- Copy an entire controller (OpenAPI tag) as one Markdown document
- OpenAPI-first extraction with DOM fallback
- Pill-shaped copy buttons injected next to Swagger UI headers
- Toast feedback on success or error
- MutationObserver keeps buttons in sync when Swagger UI re-renders

## Development

### Prerequisites

- Node.js 20+
- Google Chrome

### Setup

```bash
npm install
node scripts/generate-icons.mjs
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Build extension in watch mode |
| `npm run build` | Typecheck and build to `dist/` |
| `npm test` | Run unit tests |

## Usage

1. Navigate to any page running Swagger UI
2. Click **Copy Controller** on a tag section to copy all endpoints in that group
3. Click **Copy Endpoint** on an operation row to copy a single endpoint
4. Paste the Markdown into your AI agent chat for API integration

### Example AI prompt

```text
Integrate this API endpoint into our React app using fetch and TypeScript types:

[paste copied Markdown here]
```

## Project structure

```text
extension/
  manifest.json
  src/
    background/     Service worker
    content/        DOM injection and observers
    markdown/       Markdown builders
    openapi/        Spec resolution and ref handling
    ui/             Buttons and toasts
    popup/          Extension popup (debug toggle)
  styles/           Button and toast styles
fixtures/           Test OpenAPI specs
tests/              Unit tests
```

## Privacy

The extension runs entirely in the browser. Copied data is written to your clipboard only — nothing is sent to external servers.

## License

MIT
