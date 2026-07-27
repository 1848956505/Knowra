# Study Accelerator

Study Accelerator is a local-first learning workspace centered on three long-term modules:

- `资料` for source materials such as folders, notes, PDFs, and imported files
- `知识` for extracted concepts, tags, and structured knowledge
- `题` for AI-generated exercises, papers, and training outputs

The current repository has completed the safety baseline for the knowledge and assessment domain:

- A runnable local API for the knowledge module
- A desktop-style web workspace UI
- Versioned, atomically replaced local JSON persistence
- Attachment upload / export / import foundations
- Important-content annotations
- Fixed single-user ownership at the HTTP boundary
- Automated tests for the backend core flows

## Current Scope

This repo currently focuses on the `知识库 / 资料导航` experience:

- folder tree loading and persistence
- note CRUD
- folder CRUD
- tag CRUD
- search
- recycle / restore basics
- local attachment storage
- important-content annotation
- drag-and-drop movement for folders and files inside the materials tree

Formal knowledge items, assessment points, questions and papers are not implemented yet. Their domain rules are frozen in the documentation and will be added after the Phase 0 entry gates.

## Tech Stack

- Node.js workspace monorepo
- `apps/api`: local API service
- `apps/web`: workspace-style frontend
- `packages/shared`: shared package area
- Prisma PostgreSQL schema and Phase1.0 JSON migration tooling in `prisma/` and `scripts/`

## Project Structure

```text
Study/
├─ apps/
│  ├─ api/
│  └─ web/
├─ packages/
│  └─ shared/
├─ prisma/
├─ docs/
├─ scripts/
├─ storage/
├─ .env.example
├─ package.json
└─ tsconfig.base.json
```

## Requirements

- Node.js `>= 24`
- npm `>= 11`

## Quick Start

Install dependencies:

```bash
npm install
```

Run backend only:

```bash
npm run dev:api
```

Run frontend only:

```bash
npm run dev:web
```

Run both together:

```bash
npm run dev:all
```

`npm run dev:all` is cross-platform and works on Windows, macOS, and Ubuntu as long as `Node.js >= 24` and `npm >= 11` are available.

The dev startup script auto-selects available ports, builds the editor bundle before the web server starts, and keeps the frontend proxy aligned with the active API port.

## Test

Run the full backend test suite:

```bash
npm test
```

## Data Persistence

The project currently uses local-first persistence for development. JSON writes use a versioned schema and atomic replacement; imports validate cross-entity references before replacing current data.

Phase1.0 adds an opt-in PostgreSQL driver without changing that default. Set `PERSISTENCE_DRIVER=postgres` and `DATABASE_URL` only after deploying the Prisma migration. The JSON-to-PostgreSQL command is dry-run by default and blocks missing attachment files unless explicitly overridden.

Important paths:

- API knowledge data: [`storage/data/knowledge-base.json`](storage/data/knowledge-base.json)
- runtime dev port registry: [`storage/runtime/dev-ports.json`](storage/runtime/dev-ports.json)
- PostgreSQL migration report: `npm run migrate:postgres -- --report <report-file>`

Runtime files and upload directories are ignored by git where appropriate.

## Key Docs

- [项目总控文档](docs/学习加速器项目总控文档.md)
- [开发规范](docs/开发规范.md)
- [项目结构导航](docs/项目结构导航.md)
- [知识与考卷系统领域冻结稿](docs/知识库与试题模块/Knowra%20知识与考卷系统领域冻结稿.md)
- [知识与试题阶段 0 实施与准入说明](docs/知识库与试题模块/阶段0实施与准入说明.md)
- [Phase1.0 PostgreSQL 基础设施与 JSON 迁移](docs/知识库与试题模块/Phase1.0%20PostgreSQL基础设施与JSON迁移.md)

## Roadmap

Near-term priorities:

1. Introduce the frozen knowledge and assessment entities in vertical slices
2. Add NoteVersion and multi-aggregate history after the Phase1.0 PostgreSQL cutover is proven
3. Add question, paper and training-result workflows
4. Add reviewed background AI jobs without putting network calls in transactions
5. Replace the current single-user access boundary only when a complete login/session system is justified

## Status

Current stable version: `2.7.0`. Phase 0 is complete and Phase1.0 PostgreSQL infrastructure/migration is implemented as an opt-in path; production deployment still requires an external access-control layer such as the repository's Nginx Basic Auth template because the application does not yet include a login system.
