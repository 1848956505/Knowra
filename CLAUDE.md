# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (workspace root, uses npm workspaces)
npm install

# Run all tests (API + Web)
npm test

# Run only backend tests
npm run test:api
# or directly: node apps/api/test/run-tests.js

# Run only frontend tests (auto-discovers *.test.js under apps/web/test)
npm run test:web

# Run a single API test file
node --test apps/api/test/note-service.test.js   # node:test runner is also fine
# Most API tests are also runnable as plain scripts:
node apps/api/test/run-tests.js                  # runs all registered API tests

# Start backend API (dev, port 3001+, auto-selects if busy)
npm run dev:api
# alias: npm run start:api

# Start frontend web UI (dev, port 3000+)
npm run dev:web

# Start both together (cross-platform, auto port selection, builds editor bundle)
npm run dev:all

# Build Milkdown editor bundle (runs automatically before dev:web)
npm run build:editor-bundle -w @study-accelerator/web
```

Node.js `>= 24`, npm `>= 11` required. The dev-all script auto-selects free ports, builds the editor bundle before the web server starts, and writes the actual chosen ports to `storage/runtime/dev-ports.json` so the web server can proxy `/api/*` to the API.

## Project Structure

```
Study/
├── apps/
│   ├── api/        # Backend API — plain Node.js HTTP server (DDD-layered)
│   └── web/        # Frontend SPA — vanilla JS modular shell + JSX/React-style exploration
├── packages/
│   └── shared/     # Shared types/constants (placeholder)
├── prisma/         # Prisma schema (PostgreSQL target, not yet active)
├── docs/           # Chinese project documentation (设计/规范/计划/导航)
├── scripts/        # Dev tooling (port management, Milkdown build)
├── storage/        # Runtime data (uploads, exports, dev port registry, data JSON)
└── storage/data/   # Local-first JSON persistence
```

Two parallel UI implementations live in `apps/web`:
- **Active SPA** — vanilla JS, modular structure under `src/` (see Architecture below).
- **JSX/React-style exploration** — Next.js-style `app/` (layout/page), `components/*.jsx`, `styles/`. Not wired into the dev server yet; treat as a sandbox until the vanilla SPA is migrated away.

## Architecture

### Backend (`apps/api`)

Plain Node.js HTTP server with a **DDD-inspired** modular layering. Despite the `@nestjs/*` and `bullmq` deps in `apps/api/package.json`, those are scaffolded for a future migration — the running code uses no framework, just `node:http`.

- **`src/main.js`** — Boots `createPersistentAppContext()`, creates server, listens on auto-selected port, writes runtime port file.
- **`src/app.factory.js`** — Dependency wiring: data store, repositories, knowledge module, and HTTP handlers. `createPersistentAppContext()` is the production entry; `createAppContext()` (without persistence) is what tests use to inject in-memory fakes.
- **`src/server.js`** — Thin HTTP entry: applies CORS, serves `/` info and `/api/health`, delegates to `handleStorageRoute` then `handleKnowledgeRoute`, returns 404 or error envelope.
- **`src/config/`** — `env.schema.js` (env defaults), `storage.config.js` (paths).
- **`src/http/`** — Cross-cutting: `cors.js` (origins via `CORS_ALLOWED_ORIGINS`), `request.js` (body/query parsing), `response.js` (JSON + binary senders, `sendError` envelope), `storage-routes.js` (export/import + attachment upload/list/read/delete).
- **`src/infrastructure/`** — `file-data-store.js` (JSON persistence with snapshot import/export), `local-attachment-store.js`.
- **`src/modules/knowledge/`** — The only active business module:
  - `domain/` — Plain objects: `note.js`, `folder.js`, `tag.js`, `knowledge-space.js`, `knowledge-point.js`.
  - `application/` — Services: `note-service.js`, `folder-service.js`, `tag-service.js`, `knowledge-space-service.js`, `knowledge-point-service.js`, `knowledge-point-tag-groups.js`, `search-service.js`; plus `dto/` subfolder.
  - `infrastructure/` — In-memory repositories backed by `dataStore.state.*` arrays; every mutation calls `dataStore.flush()`.
  - `http/` — Per-entity route files (`note-routes.js`, `folder-routes.js`, `tag-routes.js`, `space-routes.js`, `knowledge-point-routes.js`) plus a top-level `knowledge-routes.js` dispatcher and `knowledge-handlers.js` (adapter for `appContext.http.knowledge`).
- **`src/presentation/`** — Markdown preview rendering (server-side).

Key invariants:
- Repositories are in-memory arrays; they call `dataStore.flush()` on every mutation, so persistence is implicit and synchronous.
- API response envelope: `{ data: ... }` for success, `{ error: { code, message } }` for failures.
- The Prisma schema shows the intended migration path off JSON files.

### Frontend (`apps/web`)

A modular vanilla-JS SPA, served via a plain Node.js HTTP server. The 5300-line monolithic `client.js` has been split — the current entry is ~150 lines that just wires the modules together.

- **`src/main.js`** — HTTP server: serves `/` with SSR-injected workspace shell, proxies `/api/*` to the API, serves static assets. Reads API origin from `API_ORIGIN` env or the runtime port file.
- **`src/server/`** — Server-side helpers: `shell-html.js` (the SSR shell template), `api-proxy.js`, `initial-workspace.js` (loads SSR snapshot for first paint), `port-listener.js`, `static-assets.js`.
- **`src/client.js`** — Boot orchestrator: builds state, controllers, event bindings, and runs `startWorkspaceLoad()`.
- **`src/app/`** — App state: `app-state.js` (initial state + constants), `app-state-actions.js` (state mutations), `element-cache.js`, `editor-runtime.js`, `formatting.js`.
- **`src/controllers/`** — One factory per concern: `app-controller-registry.js` (wires them all), `navigation-controller.js`, `editor-controller.js`, `knowledge-point-controller.js`, `sidebar-controller.js`, `search-controller.js`, `tag-controller.js`, `tab-controller.js`, `workspace-controller.js`, `shell-controller.js`, `event-bindings-controller.js`, `controller-action-proxies.js`, plus subdirs for `editor/`, `navigation/`, `knowledge-point/`.
- **`src/services/`** — `api-client.js` (fetch wrapper), `api-response.js` (envelope unwrap), `knowledge-api.js` + `knowledge-api/` subfolder.
- **`lib/`** — Feature modules: `editor/` (Milkdown integration, tab workspace, file menu, panel state, shortcuts, find/replace, image block, markdown paste), `navigation/`, `folders/`, `notes/`, `tags/`, `sidebar/`, `shell/`, `status/`, `search/`, `knowledge-points/`, `events/`, `dom/`, `browser/`. Plus utilities: `markdown.js`, `tree-workspace.js`, `tree-name-validation.js`, `workspace-loading.js`, `workspace-cache.js`, `workspace-normalization.js`, `mock-knowledge-base.js`, `mock-workspace.js`.

State model: a single global `state` object in `app-state.js` holds everything; DOM is re-rendered from state via imperative `render*()` functions called through controller action proxies. No reactive framework.

Data flow: Workspace loads in priority order — SSR snapshot (`/api/storage/export` rendered into the shell) → localStorage cache → live API fetch → mock fallback (`lib/mock-knowledge-base.js`).

The `app/` and `components/` directories at the top of `apps/web` form a separate Next.js-style React exploration that is **not** wired to the dev server.

## Testing

Both apps use a custom test runner (no Jest/Mocha) with `node:assert/strict`.

**API (`apps/api/test/run-tests.js`)** — flat, explicitly registered:
```js
export const noteServiceTests = [
  { name: '...', async run() { /* use assert.equal, etc. */ } }
];
```
Each test file exports an array; `run-tests.js` imports and runs them sequentially in one process.

**Web (`apps/web/test/run-tests.js`)** — auto-discovers every `*.test.js` under the `test/` tree (excluding `run-tests.js` and `_support/`), wraps each import in `settleEventLoop()` to isolate IIFE-style tests that mutate globals like `document`. Run a single file by importing it from a custom script or via `node --test` if the file is compatible.

## Data Flow

1. `npm run dev:api` starts the API → `main.js` builds a `createPersistentAppContext()` → loads `storage/data/knowledge-base.json` via `file-data-store.js`.
2. Request arrives at `server.js` → CORS → storage route → knowledge route → service → repository → `dataStore.flush()` writes JSON.
3. `npm run dev:web` boots the SPA server. First `GET /` returns the SSR shell with the current knowledge base inlined; client hydrates and switches to live `/api/*` calls.
4. Repository mutations on the server persist synchronously; the SPA reflects them on the next refetch.

## Key Conventions

- **Chinese-first**: UI labels, docs, commit messages are in Chinese. Code identifiers stay in English.
- **Local-first**: Default storage mode is `local-first` (JSON files). `STORAGE_MODE` env var + `STORAGE_UPLOADS_DIR` / `STORAGE_EXPORTS_DIR` / `STORAGE_TEMP_DIR` override paths. Prisma/PostgreSQL is a future migration.
- **Multi-module workspace**: Only `知识库` (knowledge) module is wired in. Other rail entries (paper, AI, tasks, review) are placeholders.
- **API response format**: `{ data: ... }` for success, `{ error: { code, message } }` for failures — simple, consistent envelope.
- **No router library**: API routes match via manual `request.method` + `url.pathname` checks in `http/` files.
- **Port discovery**: `scripts/dev-runtime-ports.js` writes `storage/runtime/dev-ports.json` so the web server can find the API without hardcoding ports.
- **Versioning & changelog**: This project follows SemVer `2.0.6`+ with Conventional Commits. The single changelog lives at [`docs/工程变更日志.md`](docs/工程变更日志.md) — every structural change must be appended there with a platform tag. See [`docs/开发规范.md`](docs/开发规范.md) §「版本号与变更日志」for full rules (Agent self-review checklist, multi-platform notes, mandatory doc list).
- **Pre-2.0.6 versioning was 0.1.0** (npm default, never published). v1.x plans are archived in `docs/已归档/`. v2.0.0~v2.0.5 are recorded as a single historical milestone in the changelog.

## Language

- 默认使用简体中文与我沟通。
- 代码、命令、文件名、目录名、变量名、函数名、接口名保持英文。
