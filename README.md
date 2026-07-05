# Study Accelerator

Study Accelerator is a local-first learning workspace centered on three long-term modules:

- `资料` for source materials such as folders, notes, PDFs, and imported files
- `知识` for extracted concepts, tags, and structured knowledge
- `题` for AI-generated exercises, papers, and training outputs

The current repository is in an early but usable stage:

- A runnable local API for the knowledge module
- A desktop-style web workspace UI
- Local JSON persistence
- Attachment upload / export / import foundations
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
- drag-and-drop movement for folders and files inside the materials tree

## Tech Stack

- Node.js workspace monorepo
- `apps/api`: local API service
- `apps/web`: workspace-style frontend
- `packages/shared`: shared package area
- Prisma schema scaffold in `prisma/`

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

The project currently uses local-first persistence for development.

Important paths:

- API knowledge data: [apps/api/storage/data/knowledge-base.json](/D:/A-Projects/Study/apps/api/storage/data/knowledge-base.json)
- runtime dev port registry: [storage/runtime/dev-ports.json](/D:/A-Projects/Study/storage/runtime/dev-ports.json)

Runtime files and upload directories are ignored by git where appropriate.

## Key Docs

- [项目总控文档](/D:/A-Projects/Study/docs/学习加速器项目总控文档.md)
- [UI 开发规范](/D:/A-Projects/Study/docs/2026-06-03-UI开发规范.md)
- [V1.1.0 开发计划](/D:/A-Projects/Study/docs/v1.1.0开发计划.md)
- [知识库定位](/D:/A-Projects/Study/docs/知识库模块/知识库定位.md)
- [本地优先知识库存储设计](/D:/A-Projects/Study/docs/知识库模块/2026-06-01-本地优先知识库存储设计.md)

## Roadmap

Near-term priorities:

1. Continue refining the materials tree and knowledge workspace interactions
2. Connect more frontend sections to real backend data
3. Expand note / tag / concept workflows
4. Prepare the persistence layer for Prisma-backed evolution
5. Gradually introduce PostgreSQL and Redis when the local-first baseline is stable

## Status

This repository is now git-initialized, committed, and connected to GitHub.
