# Study Accelerator

Study Accelerator is a local-first learning workspace organized around four long-term work domains:

- `资料` for source materials, notes, annotations and traceable versions
- `知识` for confirmed knowledge, evidence and measurable learning objectives
- `训练` for question assets, papers, attempts, grading and results
- `学习档案` for mastery, weaknesses, misconceptions, review schedules and learning history

AI, RAG, search and knowledge-graph views are horizontal capabilities rather than independent top-level modules.

The current repository has completed the safety baseline for the knowledge and assessment domain:

- A runnable local API for the knowledge module
- A desktop-style web workspace UI
- Versioned, atomically replaced local JSON persistence
- Attachment upload / export / import foundations
- Attachment atomic upload, SHA-256 integrity metadata and repair checks
- Important-content annotations
- Fixed single-user ownership at the HTTP boundary
- Automated tests for the backend core flows

## Current Scope

This repo currently provides the mature `资料` experience and the Phase2.0/Phase3.0/Phase3.1 foundations for the `知识` and `训练` work domains:

- folder tree loading and persistence
- note CRUD
- folder CRUD
- tag CRUD
- search
- recycle / restore basics
- local attachment storage
- important-content annotation
- drag-and-drop movement for folders and files inside the materials tree

Phase3.1 adds the four-work-domain shell, real Knowledge/Training asset workspaces, read-only overview/query DTOs, centralized review queues, multi-objective question binding, QuestionSource editing, ExamProfile/ExamFocus context management, and a contextual-only materials sidebar. `学习档案` remains intentionally gated until LearningEvidence and MasteryState are implemented.

The Phase2.0 knowledge-source foundation and Phase3.0 assessment foundation are implemented: immutable `NoteVersion`, source-traceable `KnowledgeEvidence`, the `KnowledgeItem` candidate/confirmation loop, `LearningObjective`, optional `ExamProfile/ExamFocus`, and manually authored `Question` assets are available through both local JSON and opt-in PostgreSQL drivers. Formal papers, attempts, grading, mastery and AI generation remain out of scope.

当前知识库与试卷模块开发以领域冻结稿为主要参考；旧的项目总控文档和知识链路开发方案仅保留为历史背景，不再作为实施依据。

## Tech Stack

- Node.js workspace monorepo
- `apps/api`: local API service
- `apps/web-v4`: current React + TypeScript V4 frontend and production web entry
- `apps/web`: retained V3 legacy frontend for regression comparison and emergency rollback
- `packages/web-core`: framework-independent API and workspace state helpers shared by V3/V4
- `packages/shared`: general shared package area
- Prisma PostgreSQL schema, Phase1.0–Phase3.0 migration tooling and attachment integrity checks in `prisma/` and `scripts/`

## Project Structure

```text
Study/
├─ apps/
│  ├─ api/
│  ├─ web/
│  └─ web-v4/
├─ packages/
│  ├─ shared/
│  └─ web-core/
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

Run the current V4 frontend only:

```bash
npm run dev:web
```

Run the retained V3 frontend only when comparing or rolling back:

```bash
npm run dev:web:legacy
```

Run both together:

```bash
npm run dev:all
```

`npm run dev:all` is cross-platform and works on Windows, macOS, and Ubuntu as long as `Node.js >= 24` and `npm >= 11` are available.

The dev startup script auto-selects available ports, starts only API + V4, and keeps the V4 proxy aligned with the active API port. `npm run dev:web:v4` remains an explicit alias for the current frontend.

## Test

Run the full backend test suite:

```bash
npm test
```

## Data Persistence

The project currently uses local-first persistence for development. JSON writes use a versioned schema and atomic replacement; imports validate cross-entity references before replacing current data.

Phase1.0 adds an opt-in PostgreSQL driver without changing that default. Set `PERSISTENCE_DRIVER=postgres` and `DATABASE_URL` only after deploying the Prisma migration. Phase2.0 adds NoteVersion, KnowledgeItem and KnowledgeEvidence; Phase3.0 adds LearningObjective, ExamProfile/ExamFocus and Question relations to both drivers. The JSON-to-PostgreSQL command is dry-run by default and blocks missing attachment files unless explicitly overridden.

Important paths:

- API knowledge data: [`storage/data/knowledge-base.json`](storage/data/knowledge-base.json)
- runtime dev port registry: [`storage/runtime/dev-ports.json`](storage/runtime/dev-ports.json)
- PostgreSQL migration report: `npm run migrate:postgres -- --report <report-file>`
- Attachment integrity report: `npm run check:attachments -- --driver local-json --report <report-file>`

Runtime files and upload directories are ignored by git where appropriate.

## Key Docs

- [领域冻结稿（当前领域基准）](docs/知识库与试题模块/Knowra%20知识与考卷系统领域冻结稿.md)
- [开发规范](docs/开发规范.md)
- [项目结构导航](docs/项目结构导航.md)
- [知识与试题阶段 0 实施与准入说明](docs/知识库与试题模块/阶段0实施与准入说明.md)
- [Phase1.0 PostgreSQL 基础设施与 JSON 迁移](docs/知识库与试题模块/Phase1.0%20PostgreSQL基础设施与JSON迁移.md)
- [Phase2.0 知识来源与知识单元基础规划](docs/知识库与试题模块/Phase2.0%20知识来源与知识单元基础规划.md)
- [Phase3.0 学习目标与基础训练题目规划](docs/知识库与试题模块/Phase3.0%20学习目标与基础训练题目规划.md)
- [前端工作域与页面规划](docs/知识库与试题模块/模块规划.md)
- [Phase3.1 四工作域前端与资产工作台规划](docs/知识库与试题模块/Phase3.1%20四工作域前端与资产工作台规划.md)

历史参考：

- [项目总控文档（已过时）](docs/学习加速器项目总控文档.md)
- [知识链路开发方案（已归档、已过时）](docs/已归档/功能设计/知识链路开发方案.md)

## Roadmap

Near-term priorities:

1. Prepare the independent Phase1.0–Phase3.2 production cutover: PostgreSQL backup, access-control confirmation and rollback rehearsal
2. Resolve the remaining historical Annotation migration warning without changing its source semantics
3. Design Phase4A formal papers, attempts and responses with immutable question snapshots
4. Keep frontend implementation separate until the Phase4A backend contract is frozen
5. Add grading, learning-evidence and mastery workflows before reviewed background AI jobs

## Status

Current stable version: `2.14.0`. Phase 0 through Phase3.2 are complete, and React V4 now loads the real workspace through the framework-independent `packages/web-core` package and its Zustand state baseline while V3 remains available during migration. Historical HTTP images have been localized, the strict JSON migration preflight is ready and all 12 local attachments pass integrity checks. PostgreSQL remains opt-in and production deployment still requires PostgreSQL backup, access-control and rollback gates; the application does not yet include a login system.
