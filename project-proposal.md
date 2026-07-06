---
title: Swagger Docs Copy-to-Markdown Chrome Extension
version: 0.1.0
date_created: 2026-07-06
last_updated: 2026-07-06
owner: TBD
tags: [chrome-extension, swagger, openapi, markdown, ai-integration, design]
---

# Introduction

This document proposes a Chrome browser extension that enhances Swagger UI documentation pages by injecting **Copy as Markdown** buttons at the **controller (tag)** level and at each **individual endpoint (operation)** level. When clicked, these buttons copy structured Markdown to the clipboard. The Markdown is designed to be pasted into an AI coding agent so the agent can integrate API endpoints with full context—method, path, parameters, request body, response examples, and related metadata.

This is a **planning and specification document only**. No implementation is included.

## 1. Purpose & Scope

### Purpose

- Reduce manual effort when sharing Swagger/OpenAPI endpoint details with AI agents.
- Provide a consistent, machine-readable Markdown format that captures everything an integrator needs.
- Mirror the UX pattern of existing "Copy Page" affordances (pill-shaped button with copy icon and label).

### Scope (In)

- Chrome extension (Manifest V3) that runs on pages hosting Swagger UI.
- Content script that detects Swagger UI DOM structure and injects copy buttons.
- Two button placements:
  - **Controller button**: copies all endpoints under a tag/controller as a single Markdown document.
  - **Endpoint button**: copies a single operation as Markdown.
- Markdown output includes: endpoint name/summary, HTTP method, path, description, path parameters, query parameters, header parameters, request body schema, request body example, response status codes, response schemas, response examples, security requirements, and tags.
- Clipboard copy via `navigator.clipboard.writeText`.
- Visual feedback on successful copy (toast or button state change).

### Scope (Out)

- Firefox, Safari, or Edge-specific builds (Chrome-first; portability may follow later).
- Modifying Swagger UI source or server-side OpenAPI generation.
- Authenticated API calls or live request execution.
- Editing or exporting the full OpenAPI JSON/YAML file.
- AI agent integration beyond producing clipboard-ready Markdown.

### Audience

- Developers building the extension.
- Developers using Swagger docs who want to brief AI agents on API integration.
- AI agents consuming the generated Markdown (implicit consumer).

### Assumptions

- Target pages use **Swagger UI** (v3.x or v4.x) rendered in the browser.
- The OpenAPI specification is embedded in the page (inline `spec` object or fetched `url`).
- Users have clipboard permissions in Chrome.
- Swagger UI DOM structure may vary slightly by version; the extension must tolerate common variants.

## 2. Definitions

| Term | Definition |
|------|------------|
| **Chrome Extension** | A browser add-on using Manifest V3 with a service worker, content scripts, and optional popup. |
| **Content Script** | JavaScript injected into Swagger UI pages to read DOM and inject UI. |
| **Swagger UI** | Open-source UI that renders OpenAPI specifications interactively. |
| **OpenAPI** | Specification format (formerly Swagger) describing REST APIs. |
| **Controller** | Logical API grouping in Swagger UI, typically mapped to an OpenAPI `tag`. |
| **Endpoint / Operation** | A single HTTP operation (e.g., `GET /users/{id}`) defined in OpenAPI `paths`. |
| **Tag** | OpenAPI field grouping operations; displayed as a section header in Swagger UI. |
| **Operation** | One HTTP method + path combination (e.g., `post` on `/users`). |
| **Markdown (MD)** | Plain-text format used as the clipboard output for AI consumption. |
| **AI Agent** | LLM-based coding assistant that receives the copied Markdown as integration context. |

## 3. Requirements, Constraints & Guidelines

### Functional Requirements

- **REQ-001**: The extension SHALL inject a **Copy Controller** button adjacent to each controller/tag section header in Swagger UI.
- **REQ-002**: The extension SHALL inject a **Copy Endpoint** button adjacent to each operation block (method + path row).
- **REQ-003**: Clicking **Copy Controller** SHALL copy Markdown containing all operations under that tag, in document order.
- **REQ-004**: Clicking **Copy Endpoint** SHALL copy Markdown for exactly one operation.
- **REQ-005**: Endpoint Markdown SHALL include, when present in the OpenAPI spec:
  - Operation ID (if defined)
  - Summary and description
  - HTTP method (uppercase)
  - Full path template (e.g., `/api/v1/users/{id}`)
  - Tags
  - Path parameters (name, type, required, description, example)
  - Query parameters (name, type, required, description, example, enum values)
  - Header parameters
  - Request body content type(s), schema, and example(s)
  - Response entries per status code: description, schema, example(s)
  - Security / auth schemes referenced by the operation
  - Deprecated flag (if true)
- **REQ-006**: The extension SHALL prefer **parsed OpenAPI data** over scraping rendered HTML tables when both are available.
- **REQ-007**: The extension SHALL fall back to DOM scraping when OpenAPI data cannot be resolved.
- **REQ-008**: On successful copy, the extension SHALL provide visible feedback within 500 ms.
- **REQ-009**: On copy failure, the extension SHALL show an error message and SHALL NOT silently fail.
- **REQ-010**: Buttons SHALL match the reference UX: white pill-shaped button, copy icon on the left, text label on the right (e.g., "Copy Controller", "Copy Endpoint").

### Non-Functional Requirements

- **NFR-001**: Button injection SHALL complete within 2 seconds of Swagger UI finishing its initial render on a typical spec (≤ 100 operations).
- **NFR-002**: Copy action SHALL complete within 1 second for a single endpoint.
- **NFR-003**: The extension SHALL not persist or transmit copied data to any external server.
- **NFR-004**: The extension SHALL work on `localhost` and internal network Swagger URLs.

### Constraints

- **CON-001**: Must use Chrome Extension Manifest V3.
- **CON-002**: Must not require server-side changes to the API or Swagger host.
- **CON-003**: Clipboard access must comply with Chrome permissions model (`clipboardWrite` or user-gesture copy).
- **CON-004**: Must not bundle copyrighted Swagger UI assets; only interact with the live page.

### Security Requirements

- **SEC-001**: The extension SHALL request the minimum host permissions needed (configurable match patterns, e.g., `<all_urls>` or user-defined origins).
- **SEC-002**: The extension SHALL NOT exfiltrate page content or clipboard data.
- **SEC-003**: Copied Markdown MAY contain sensitive example values from the spec; the UI SHALL NOT redact unless a future opt-in setting is added.

### Guidelines

- **GUD-001**: Markdown output SHOULD be optimized for LLM parsing: clear headings, fenced code blocks for JSON examples, tables for parameters.
- **GUD-002**: Prefer stable OpenAPI fields (`operationId`, `summary`) over UI-derived labels.
- **GUD-003**: Use a MutationObserver to re-inject buttons when Swagger UI re-renders (expand/collapse, filter, tag navigation).
- **GUD-004**: Keep the content script idempotent—avoid duplicate buttons on re-render.
- **GUD-005**: Log diagnostics only when a debug flag is enabled (extension options page).

## 4. Interfaces & Data Contracts

### 4.1 Extension Components

```
┌─────────────────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3)                         │
├─────────────────────────────────────────────────────────┤
│  service_worker.js    │  Lifecycle, permissions, options│
│  content_script.js    │  DOM injection, event handlers  │
│  openapi_resolver.js  │  Extract/parse OpenAPI from page│
│  markdown_builder.js  │  OpenAPI operation → Markdown   │
│  styles.css           │  Button appearance              │
│  icons/               │  Extension toolbar icon         │
│  popup.html (opt.)    │  Enable/disable, debug toggle   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 OpenAPI Resolution Strategy

The content script SHALL attempt resolution in this order:

| Priority | Source | How |
|----------|--------|-----|
| 1 | Inline global | `window.ui.getConfigs().spec` or Swagger UI internal state |
| 2 | Swagger UI API | `window.ui.specSelectors` / `getState().spec.json` (version-dependent) |
| 3 | Embedded script | `<script>` tag containing OpenAPI JSON |
| 4 | Fetched spec URL | Read `url` or `configUrl` from Swagger UI init and fetch (same-origin or CORS-permitted) |
| 5 | DOM fallback | Parse visible operation panels for method, path, tables |

### 4.3 Markdown Output Schema (Endpoint)

Each single-endpoint Markdown document SHALL follow this structure:

```markdown
# {summary or operationId or "METHOD path"}

## Overview

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/v1/users/{userId}` |
| Operation ID | `getUserById` |
| Tags | `Users` |
| Deprecated | `false` |

## Description

{description text}

## Security

- BearerAuth (HTTP Bearer)

## Path Parameters

| Name | In | Type | Required | Description | Example |
|------|----|------|----------|-------------|---------|
| userId | path | string (uuid) | yes | User identifier | `550e8400-e29b-41d4-a716-446655440000` |

## Query Parameters

| Name | In | Type | Required | Description | Example |
|------|----|------|----------|-------------|---------|
| include | query | string | no | Related resources to embed | `profile` |

## Request Body

**Content-Type:** `application/json`

### Schema

```json
{ ... JSON Schema subset or simplified representation ... }
```

### Example

```json
{ "name": "Jane Doe" }
```

## Responses

### 200 OK

{description}

```json
{ "id": "...", "name": "..." }
```

### 404 Not Found

{description}

```

### 4.4 Markdown Output Schema (Controller)

Controller-level output SHALL be:

```markdown
# Controller: {tagName}

> {tag description if available}

---

{endpoint markdown block 1}

---

{endpoint markdown block 2}

...
```

Operations SHALL appear in the same order as Swagger UI displays them under the tag.

### 4.5 Button DOM Contract

Injected button element:

| Attribute | Value |
|-----------|-------|
| `class` | `swagg-spec-copy-btn` (+ variant: `swagg-spec-copy-controller` / `swagg-spec-copy-endpoint`) |
| `data-tag` | Tag name (controller button only) |
| `data-operation-id` | OpenAPI operationId or synthetic key `METHOD:path` |
| `aria-label` | Accessible label matching visible text |
| `type` | `button` |

### 4.6 Clipboard Interface

```typescript
// Conceptual contract (not implementation)
interface CopyResult {
  success: boolean;
  markdown: string;
  error?: string;
}
```

## 5. Acceptance Criteria

- **AC-001**: Given a Swagger UI page with at least one tag, When the page finishes loading, Then a **Copy Controller** button appears on each tag header.
- **AC-002**: Given a Swagger UI page with at least one operation, When the page finishes loading, Then a **Copy Endpoint** button appears on each operation row.
- **AC-003**: Given a user clicks **Copy Endpoint** on `GET /users/{id}`, When the copy completes, Then the clipboard contains Markdown with method `GET`, path `/users/{id}`, and all defined parameters and responses.
- **AC-004**: Given a user clicks **Copy Controller** on tag `Users`, When the copy completes, Then the clipboard contains Markdown for every operation tagged `Users`.
- **AC-005**: Given an operation with a request body example in the spec, When copied, Then the example appears in a fenced `json` code block.
- **AC-006**: Given an operation with no request body, When copied, Then the Request Body section is omitted (not empty placeholder).
- **AC-007**: Given Swagger UI re-renders after a filter change, When the DOM updates, Then buttons are present without duplicates.
- **AC-008**: Given clipboard permission is denied, When the user clicks copy, Then an error toast is shown.
- **AC-009**: Given the copied Markdown is pasted into an AI agent chat, When the agent reads it, Then it can identify method, path, auth, parameters, body, and response shape without referencing the original Swagger page.

## 6. Test Automation Strategy

### Test Levels

| Level | Focus |
|-------|-------|
| **Unit** | `markdown_builder`: operation → Markdown string; edge cases (no body, no examples, enums, `$ref` resolution) |
| **Unit** | `openapi_resolver`: parsing from mock Swagger UI state objects |
| **Integration** | Content script against static HTML fixtures mimicking Swagger UI DOM |
| **E2E** | Puppeteer/Playwright with Chrome extension loaded against sample Swagger UI pages |

### Frameworks

- **JavaScript/TypeScript**: Vitest or Jest for unit tests
- **E2E**: Playwright with custom Chrome extension loading fixture
- **Fixtures**: Sample OpenAPI 3.0 specs (minimal, full-featured, edge cases)

### Test Data

- `fixtures/petstore.json` — Swagger Petstore (OpenAPI 3.0)
- `fixtures/no-examples.json` — spec without examples
- `fixtures/complex-params.json` — nested objects, arrays, enums, multiple content types
- `fixtures/swagger-ui-v3.html` / `fixtures/swagger-ui-v4.html` — static rendered pages

### CI/CD Integration

- GitHub Actions: lint → unit tests → build extension zip → E2E (optional on PR)
- Artifact: packaged `.zip` for manual Chrome load

### Coverage Requirements

- Minimum **80%** line coverage on `markdown_builder` and `openapi_resolver`
- All acceptance criteria mapped to at least one automated test

## 7. Rationale & Context

### Problem

Developers integrating APIs often copy details manually from Swagger UI into AI chat sessions. This is slow, inconsistent, and frequently omits parameters, examples, or auth requirements—leading to incorrect generated client code.

### Solution Rationale

- **Chrome extension** avoids modifying each API project's Swagger deployment.
- **Markdown** is the lingua franca for LLM context: headings and code fences parse reliably.
- **OpenAPI-first extraction** ensures completeness vs. scraping visible UI fragments.
- **Two granularities** (controller vs. endpoint) match common workflows: "integrate this whole resource" vs. "implement this one call."

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data source | OpenAPI spec over DOM | Completeness, stability |
| Output format | Markdown | AI-friendly, human-readable |
| Injection point | Content script | Direct DOM access, no CORS issues for inline spec |
| Manifest version | V3 | Chrome store requirement |
| UI pattern | Pill copy button | Matches reference UX; low visual intrusion |

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001**: Swagger UI (v3/v4) — target runtime environment; DOM and JS API vary by version
- **EXT-002**: OpenAPI 3.x specifications — primary data model for Markdown generation

### Third-Party Services

- None required. Extension operates fully client-side.

### Infrastructure Dependencies

- **INF-001**: Google Chrome (latest stable) — Manifest V3 support
- **INF-002**: Chrome Web Store (optional) — distribution channel for published builds

### Data Dependencies

- **DAT-001**: OpenAPI spec embedded in or loaded by the Swagger UI page — JSON or YAML format

### Technology Platform Dependencies

- **PLT-001**: JavaScript/TypeScript — extension implementation language
- **PLT-002**: Chrome Extension APIs — `chrome.scripting`, `chrome.storage` (options), clipboard via Web API

### Compliance Dependencies

- **COM-001**: Chrome Web Store Developer Program Policies — if published publicly

## 9. Examples & Edge Cases

### Example: Single Endpoint Copy (AI Integration Prompt)

After copying, a developer pastes into an AI agent:

```
Integrate this API endpoint into our React app using fetch and TypeScript types:

[paste Markdown here]
```

The Markdown alone should supply enough structure for the agent to produce a typed client function.

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| `$ref` in schemas | Resolve refs within the spec; inline simplified schema in Markdown |
| Multiple request content types | List each content type with its schema and example |
| No examples in spec | Show schema only; omit Example subsection |
| Deprecated operation | Include `Deprecated: true` in Overview table |
| Operation hidden by Swagger UI filter | Button not visible (acceptable); copy only visible ops |
| Multiple tags on one operation | Include all tags; controller copy includes op under each tag's controller copy |
| Swagger 2.0 spec | Support via converter or separate code path (phase 2 if needed) |
| OAuth2 / API key security | List scheme name and type under Security section |
| Very large spec (500+ ops) | Controller copy may be large; no truncation in v1 |
| CORS-blocked spec URL | Fall back to DOM scraping or inline spec only |
| Shadow DOM in future Swagger versions | May require updated selectors; document version matrix |

### Reference UI

Button appearance should align with the provided reference: white background, rounded pill shape, copy icon (two overlapping squares) left of label text.

## 10. Validation Criteria

Compliance with this proposal is validated when:

1. All **REQ-*** and **SEC-*** items are implemented and traceable in code.
2. All **AC-*** acceptance criteria pass in E2E tests.
3. Generated Markdown from the Petstore fixture matches golden snapshot files.
4. Manual QA on at least two real-world Swagger deployments (internal API + public API).
5. No network requests are made by the extension except optional same-origin spec fetch.
6. Chrome Web Store privacy questionnaire can be answered: "No data collected."

## 11. Related Specifications / Further Reading

- [OpenAPI Specification 3.0](https://swagger.io/specification/)
- [Swagger UI GitHub](https://github.com/swagger-api/swagger-ui)
- [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Clipboard API](https://developer.w3.org/TR/clipboard-apis/)

---

## Appendix A: Proposed Project Structure

```
swagg-spec/
├── project-proposal.md          # This document
├── spec/
│   └── spec-design-swagger-copy-extension.md   # Detailed design spec (future)
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── content/
│   │   │   ├── inject.ts
│   │   │   └── observer.ts
│   │   ├── openapi/
│   │   │   ├── resolver.ts
│   │   │   └── ref-resolver.ts
│   │   ├── markdown/
│   │   │   ├── endpoint.ts
│   │   │   └── controller.ts
│   │   └── ui/
│   │       ├── button.ts
│   │       └── toast.ts
│   ├── styles/
│   │   └── copy-button.css
│   └── assets/
│       └── icons/
├── fixtures/
│   ├── petstore.openapi.json
│   └── swagger-ui-pages/
├── tests/
│   ├── unit/
│   └── e2e/
├── package.json
└── README.md
```

## Appendix B: Implementation Phases (High-Level Roadmap)

| Phase | Deliverable | Duration (est.) |
|-------|-------------|-----------------|
| **Phase 1 — Spike** | Prove OpenAPI extraction from Swagger UI page; single endpoint → Markdown | 2–3 days |
| **Phase 2 — Core** | Button injection, endpoint copy, clipboard, feedback | 3–5 days |
| **Phase 3 — Controller** | Tag-level aggregation, ordering, separator formatting | 2 days |
| **Phase 4 — Hardening** | MutationObserver, dedup, error handling, Swagger v3/v4 matrix | 3 days |
| **Phase 5 — Quality** | Unit + E2E tests, fixtures, README, load-unpacked instructions | 3 days |
| **Phase 6 — Publish** (optional) | Chrome Web Store listing, icons, privacy policy | 2 days |

**Total estimate:** 15–18 working days for a single developer.

## Appendix C: Open Questions

| ID | Question | Impact |
|----|----------|--------|
| OQ-001 | Support OpenAPI 2.0 (Swagger 2.0) in v1? | Scope |
| OQ-002 | User-configurable host allowlist vs. `<all_urls>`? | Permissions UX |
| OQ-003 | Include `curl` command generation in Markdown? | Output format |
| OQ-004 | TypeScript-first extension build (Vite + CRX) or plain JS? | Tooling |
| OQ-005 | Redact/example-toggle for sensitive fields? | Security UX |
