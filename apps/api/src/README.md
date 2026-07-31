# API App

这里承载知识库后端应用的代码骨架。

当前已落地：

- 本地优先存储配置
- Phase1.0–Phase3.0 PostgreSQL schema、异步 Repository 和 JSON 迁移预检/应用脚本
- Phase3.1 四工作域只读查询服务、概览 DTO、稳定分页、审核队列和双驱动 API 适配
- 知识库领域对象骨架
- NoteService、知识来源、学习目标和基础训练题目服务

默认仍是 `PERSISTENCE_DRIVER=local-json`。PostgreSQL 运行前执行根目录的 `npm run prisma:generate` 和 `npm run prisma:migrate:deploy`，再设置 `DATABASE_URL` 与 `PERSISTENCE_DRIVER=postgres`。

Phase3.1 不新增正式训练执行实体；`workspace-query-*` 只负责批量读取 KnowledgeItem、LearningObjective、Question、ExamProfile/ExamFocus 及其来源摘要，写入仍由原 application service 负责。`/api/knowledge/overview`、`/api/knowledge/training-overview` 与 `/api/knowledge/review-queue` 保持 `{ data }` 响应信封。
