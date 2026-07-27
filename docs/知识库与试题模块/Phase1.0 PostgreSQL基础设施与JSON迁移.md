# Phase1.0：PostgreSQL 基础设施与 JSON 迁移

## 目标与边界

Phase1.0 为当前知识库模块建立 PostgreSQL 持久化后端和一次性 JSON 迁移工具，但不改变默认运行行为：

- `PERSISTENCE_DRIVER=local-json` 仍使用现有同步 JSON Repository，是开发和回退默认值。
- `PERSISTENCE_DRIVER=postgres` 才创建 Prisma Client、PostgreSQL Repository 和异步知识库应用服务；不做静默降级。
- 附件二进制继续保存在本地 `storage/uploads/`，PostgreSQL 只保存附件元数据。
- 当前阶段不加入 `NoteVersion`、知识点、题目、Embedding、DocumentChunk、IngestionJob 等后续模型。

## 已实现的结构

### Prisma 与迁移

- `prisma/schema.prisma`：`User`、`KnowledgeSpace`、`Folder`、`Tag`、`Note`、`NoteTag`、`Attachment`、`ContentAnnotation`。
- `prisma/migrations/0_phase1_initial/migration.sql`：初始表、索引、外键和目录同级名称唯一的 PostgreSQL partial unique index。
- `prisma/migrations/migration_lock.toml`：固定 PostgreSQL provider。
- `internalLinks` 与 `headingPath` 暂保留 JSONB，保持当前 API 语义；待语义稳定后再评估关系化。
- `deleted` 在数据库中映射为 `deletedAt`，不丢失回收站数据。

### 运行时接入

- `apps/api/src/postgres-app.factory.js` 是 PostgreSQL 应用上下文入口。
- `apps/api/src/modules/knowledge/infrastructure/postgres/` 提供按聚合拆分的异步 Repository。
- `apps/api/src/modules/knowledge/application/postgres-async/` 提供异步应用服务；原有同步服务不被替换，保证 JSON 路径稳定。
- `apps/api/src/infrastructure/postgres-attachment-store.js` 负责“文件先写、元数据后提交”和失败补偿。
- HTTP route 对服务结果统一 `await`，同步 JSON 返回值仍可直接被 `await`，因此 API envelope 不变。

启用前先执行：

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
PERSISTENCE_DRIVER=postgres DATABASE_URL=postgresql://... npm run dev:api
```

PostgreSQL 驱动未配置 `DATABASE_URL` 时会显式失败，不会自动切回 JSON。

## JSON 迁移流程

入口：`scripts/migrate-json-to-postgres.mjs`。

默认是只读预检，不连接数据库、不修改 JSON、不写附件：

```bash
npm run migrate:postgres -- --report storage/exports/phase1-migration.json
```

预检会：

1. 读取并校验本地 JSON 集合和跨实体引用。
2. 兼容无 `schemaVersion` 的旧文件，记录默认值、时间字段、内部链接等修复。
3. 原样保留字符串 ID（包括中文 ID）、回收站状态、标签关联和标注。
4. 为正文计算 `contentHash`，核对附件文件存在性、实际大小和 SHA-256。
5. 生成 counts、repairs、warnings、errors、checksum 报告。

只有预检通过后才允许显式 `--apply`：

```bash
npm run migrate:postgres -- \
  --apply \
  --report storage/exports/phase1-migration-applied.json
```

迁移应用前检查目标库为空；应用阶段只在单个 Prisma `$transaction` 中写数据库，附件文件读取和哈希校验均在事务外完成。目标库已有数据时会拒绝执行，不做覆盖式迁移。

当前工作区的 JSON 元数据中有 6 个附件文件缺失，因此默认预检会阻断 apply。这是保护措施，不应使用 `--allow-missing-attachments` 掩盖生产数据缺失；只有明确接受“数据库保留缺失文件元数据”的临时恢复场景才可使用该参数。

## 回滚与切换

迁移前应完成三份可恢复备份：

1. JSON 源文件副本。
2. `storage/uploads/` 附件目录副本。
3. PostgreSQL 目标库在迁移前的 `pg_dump`（目标库应为空，仍建议保留）。

迁移事务中任一数据库写入失败会自动回滚全部数据库行；迁移脚本不在数据库事务内执行文件 I/O。切换 PostgreSQL 前先停止写入并做验证，确认 API 读写和附件读取正常后再切换 `PERSISTENCE_DRIVER`。若 PostgreSQL 已接受新写入，不能把 JSON 直接当作最新数据回退；应停止服务、按维护窗口决定恢复 PostgreSQL 备份或执行反向迁移。

## NoteVersion 决策

本阶段不加入 `NoteVersion`。理由是：

- 当前 JSON 没有稳定的版本集合和版本写入协议。
- 引入后会要求每次正文更新同时写 Note 与 NoteVersion，并定义并发冲突、保留策略、恢复接口和导入语义。
- Phase1.0 的目标是可靠基础设施与可验证迁移，不能用“先建表、后补语义”的半成品扩大切换风险。

NoteVersion 应在后续独立阶段以“版本写入服务 + 并发控制 + 查询/恢复 API + 数据保留策略”整体加入。

## 验收基线

- 默认 JSON API 行为和现有 API/Web 测试不被 PostgreSQL 改动破坏。
- Prisma schema 可通过 `prisma validate`，migration provider 为 PostgreSQL。
- 迁移脚本默认只读，缺失附件默认阻断 apply，目标非空默认拒绝。
- 迁移报告可解释所有修复和警告，字符串 ID、软删除、标签、标注和附件元数据可追溯。
- PostgreSQL 驱动不静默降级，应用层仍遵循 `domain -> application -> infrastructure -> http` 边界。
