# API App

这里承载知识库后端应用的代码骨架。

当前已落地：

- 本地优先存储配置
- Phase1.0 PostgreSQL schema、异步 Repository 和 JSON 迁移预检/应用脚本
- 知识库领域对象骨架
- NoteService 最小实现

默认仍是 `PERSISTENCE_DRIVER=local-json`。PostgreSQL 运行前执行根目录的 `npm run prisma:generate` 和 `npm run prisma:migrate:deploy`，再设置 `DATABASE_URL` 与 `PERSISTENCE_DRIVER=postgres`。
