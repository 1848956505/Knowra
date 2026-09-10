# Phase3.2：后端一致性与安全准入

> 文档状态：已完成（2026-07-31）；生产 PostgreSQL 切换与版本标签需单独执行
> 发布版本：`2.12.0`
> 适用范围：local-json / PostgreSQL 一致性、单 owner 边界、附件路径安全、正式资产门禁、快照与迁移并发、Note 写入并发和 PostgreSQL migration 4
> 前置阶段：Phase2.0、Phase3.0、Phase3.1 已形成知识、目标、题目资产闭环
> 领域基准：[Knowra 知识与考卷系统领域冻结稿](Knowra%20知识与考卷系统领域冻结稿.md)
> 产品规划：[Knowra 前端工作域与页面规划](模块规划.md)

## 1. 阶段定位

Phase3.2 是进入正式训练执行领域前的后端准入阶段，不新增新的产品工作域，也不实现 `Exam`、`Attempt`、批改或掌握度。

Phase2.0 和 Phase3.0 已经形成：

```text
Note / NoteVersion
→ KnowledgeEvidence / KnowledgeItem
→ LearningObjective
→ Question / QuestionSource
```

Phase3.1 又为这些资产增加了独立工作台和批量查询能力。随着正式资产、双持久化驱动、整库快照和附件文件同时进入同一系统，早期只在单路径、单请求下成立的假设需要在进入 Phase4A 前统一收口。

Phase3.2 的目标是：

> 让同一份正式数据在 local-json 与 PostgreSQL 下都遵守可解释的 owner、引用、确认、并发和文件安全门禁，并保证失败不会留下部分成功或不可重启状态。

本阶段完成后，后端才具备进入“正式试卷快照与训练执行”设计的安全前提。

## 2. 审查发现

| 编号 | 发现 | 风险 | 影响范围 |
| --- | --- | --- | --- |
| P3.2-01 | local-json 永久删除 Note 或清空回收站时，NoteVersion 未随无正式引用的 Note 一起处理 | 磁盘留下孤立 NoteVersion；进程重启时触发 `STORAGE_SNAPSHOT_INVALID` | local-json、Note/NoteVersion |
| P3.2-02 | 固定 owner、存量 KnowledgeSpace owner、快照 owner 和迁移 owner 的校验入口不统一 | 配置错误时可能读取、导入或迁移其他 owner 的空间 | local-json、PostgreSQL、快照、迁移 |
| P3.2-03 | 历史附件记录中的 `storagePath`、旧 uploads 路径和动态 HTTP 路由存在过度信任输入的空间 | 目录穿越、绝对路径读取、符号链接逃逸、误删非托管文件或相似路由误命中 | 两驱动附件、快照、迁移、HTTP |
| P3.2-04 | PostgreSQL 普通请求、整库 import/export 和 JSON → PostgreSQL apply 缺少同一套维护期互斥协议 | 导出读到混合时点；导入清空与普通写入交错；空库检查与写入之间出现竞争窗口 | PostgreSQL、快照、迁移 |
| P3.2-05 | Note 同级名称只依赖应用层预查，更新也缺少显式版本令牌 | 并发请求可能创建重名 Note，或后提交的旧内容覆盖新内容 | 两驱动 Note，PostgreSQL 约束 |
| P3.2-06 | 正式资产的 create/confirm 校验散落在服务、导入与关系检查中 | 重复客户端 ID 可能覆盖；导入可绕过正式确认门禁；两驱动错误语义漂移 | KnowledgeItem、LearningObjective、Question |
| P3.2-07 | QuestionSource 健康状态和上游资产状态变化未完全由真实引用推导 | 已确认题目可能继续依赖失效来源、候选目标或已退回知识资产 | Question、QuestionSource、上游正式资产 |
| P3.2-08 | 相同正文的重复保存仍可能触发来源 stale 联动；选择题 option ID 唯一性和目标动作语义不够严格 | 制造无意义复核任务，或保存不可稳定判定的正式题目/目标 | NoteVersion、LearningObjective、Question |
| P3.2-09 | JSON → PostgreSQL 预检未复用 HTTP 图片安全策略，且旧图片迁移脚本把同一 URL 的重复引用误判为异常 | 不安全图片可绕过普通写入门禁进入 PostgreSQL，当前快照无法安全往返 | Note、JSON 迁移、快照、历史数据修复 |

## 3. 本阶段范围

### 3.1 纳入范围

- Note 永久删除、清空回收站与 NoteVersion 的原子一致性；
- local-json / PostgreSQL 启动、查询、快照和迁移的单 owner 边界；
- 附件托管路径推导、旧文件迁移、符号链接防护、严格动态路由和失败补偿；
- KnowledgeItem、LearningObjective、Question 的共享正式确认门禁；
- QuestionSource 状态从真实引用推导，以及上游失效后的题目降级；
- Note 乐观并发令牌和 PostgreSQL 条件更新；
- PostgreSQL 普通读写、整库维护操作和迁移 apply 的互斥协议；
- PostgreSQL migration 4 的同级活动 Note 唯一索引；
- 双驱动、快照、迁移、HTTP 和失败回滚的回归验证。

### 3.2 约束原则

1. 正式来源历史优先于“清空”操作的便利性。
2. 客户端字段、快照字段和数据库字段都不能绕过 application/domain 门禁。
3. local-json 与 PostgreSQL 返回相同领域错误语义，但不伪装成相同的并发和耐久能力。
4. 附件记录不是任意文件系统路径授权；只有托管目录中的规范普通文件可以读取、迁移或删除。
5. 外部文件 I/O 不进入 PostgreSQL 业务事务；失败通过 pending 状态、补偿清理和可复核报告处理。
6. 整库 import/export 是维护操作，不能与普通写入并行。
7. 所有并发保护都必须有数据库约束、条件更新或显式锁作为最终防线，不能只依赖“先查询再写入”。

## 4. 修复策略

### 4.1 Note、NoteVersion 与永久删除

冻结以下处理规则：

1. 软删除 Note 仍保留 NoteVersion，并把相关正式来源标记为失效或需要复核。
2. Note 仍被 `KnowledgeEvidence` 或直接 `NoteVersion` 类型的 `QuestionSource` 等正式来源引用时，单条永久删除和清空回收站都必须拒绝，不删除 Note 或 NoteVersion。
3. 无正式来源引用的 Note 可以永久删除，但 Note、NoteVersion、Annotation 和附件元数据必须在同一个 local-json 事务中提交。
4. 附件文件实体仍在事务提交后清理；事务失败时不得删除文件。
5. `emptyRecycleBin` 必须先对全部候选 Note 执行正式来源预检，再开始任何删除，不能出现“前几条已删、遇到受保护 Note 才失败”。
6. 永久删除成功后的磁盘快照必须能够重新创建应用上下文，不得留下关系校验无法加载的孤立 NoteVersion。

该策略不把 NoteVersion 改造成无父 Note 的独立存储，也不通过放宽 `validateNoteVersions` 掩盖破损引用。

### 4.2 单 owner 边界

当前仍是单用户运行模式，Phase3.2 不实现登录系统，但把 owner 变成所有持久化入口的硬门禁。

#### local-json

- 显式 `KNOWRA_OWNER_ID` 或应用上下文 `ownerId` 优先；
- 未显式配置时，可以从现有 KnowledgeSpace 推断唯一 owner；
- 存量空间包含多个 owner，或显式 owner 与存量空间不一致时，启动失败并返回 `OWNER_BOUNDARY_VIOLATION`；
- 快照导入必须验证所有 KnowledgeSpace 属于当前 server owner；
- HTTP 创建和查询空间继续忽略客户端提交的 `userId`。

#### PostgreSQL

- 连接数据库后先读取 KnowledgeSpace owner，再创建或恢复 server owner；
- 数据库中存在其他 owner 的空间时拒绝启动，不能通过 upsert 新 owner 掩盖冲突；
- 整库导入和 JSON → PostgreSQL 迁移必须接收并校验同一个 owner；
- PostgreSQL 附件操作除检查 Note 存在和未删除外，还要验证其 KnowledgeSpace 属于当前 owner。

单 owner 门禁不等于身份认证。公网访问仍必须依赖现有 Basic Auth 发布门禁，或等待独立的正式登录与会话安全阶段。

### 4.3 附件路径与文件安全

附件文件策略收敛为：

```text
attachment.id + attachment.fileName
→ 规范托管文件名
→ 当前 uploadsDir 下的唯一目标
```

具体规则：

- 不把持久化 `storagePath` 当作任意绝对路径或任意相对路径直接读取；
- 附件 ID 必须是安全路径段；
- 所有读取、删除、重命名和旧文件迁移都要确认最终路径位于当前托管 uploadsDir；
- 拒绝绝对路径、`..`、路径分隔符注入和托管目录外目标；
- 拒绝以符号链接伪装成普通附件文件或目录；
- 旧 uploads 目录只迁移名称可确定、真实存在且为普通文件的同名附件；
- 附件快照和 JSON 迁移将不安全路径报告为 `ATTACHMENT_PATH_UNSAFE`，将符号链接报告为 `ATTACHMENT_PATH_SYMLINK`；
- `--allow-missing-attachments` 只能接受“文件确实缺失”的显式恢复场景，不能绕过路径或符号链接安全错误；
- JSON → PostgreSQL 预检复用 Note 图片安全策略，发现 `http://` 图片时以 `INSECURE_IMAGE_URL` 阻断 apply；
- 附件 HTTP 动态路由必须严格匹配完整分段，额外路径段返回 404；
- PostgreSQL 上传仍采用 `pending → 原子写文件 → ready`；ready 元数据提交失败且 pending 行已经回滚/消失时，必须补偿清理新文件；
- 自定义 `STORAGE_UPLOADS_DIR` 必须沿应用上下文、附件 store、快照和迁移完整透传，不得回落到硬编码默认目录。

### 4.4 正式资产共享门禁

新增共享正式资产校验，供 local-json、PostgreSQL application service、快照关系校验和导入预检复用。

#### 创建 ID

- 客户端显式提交的 KnowledgeItem、KnowledgeEvidence、LearningObjective、ExamProfile、ExamFocus、Question 和 QuestionSource ID 如果已存在，返回稳定 `409 *_ID_CONFLICT`；
- Repository 的 save/upsert 能力不能被 HTTP create 当作覆盖式创建接口。

#### KnowledgeItem

- confirmed 必须拥有标题与 `canonicalStatement`；
- 非 manual 来源必须至少有一条 `valid` KnowledgeEvidence；
- 正式内容被修改、请求修订或来源不足时，状态回到候选/需修订语义；
- 导入 confirmed KnowledgeItem 时执行同一门禁。

#### LearningObjective

- confirmed Objective 的父 KnowledgeItem 必须 confirmed；
- 目标必须同时有可评测陈述、受控 `actionVerb` 和 `cognitiveLevel`；
- 以“了解、熟悉、掌握”等模糊动作开头的目标不得确认；
- `actionVerb` 与 `cognitiveLevel` 必须匹配，例如 `explain → understand`、`apply/calculate → apply`、`compare/analyze → analyze`；
- Objective 被退回、归档或编辑后，依赖它的 confirmed Question 必须进入 candidate 复核态。

#### Question

- confirmed Question 的所有 LearningObjective 都必须 confirmed；
- 必须具有通过题型结构校验的题干、答案或 rubric；
- choice 题 option ID 必须非空且在题内唯一；
- 至少有一条 QuestionSource，且所有来源状态均为 `active`；
- QuestionSource 的状态由真实引用推导，客户端不能伪造 `active`；
- KnowledgeItem、LearningObjective、NoteVersion 或 KnowledgeEvidence 失效时，相关来源转为 stale，confirmed Question 降为 candidate；
- confirmed Question 的内容、目标或来源发生变化时，版本递增并回到 candidate。

### 4.5 相同正文保存与来源健康

Note 更新需要先比较真实正文内容或内容哈希：

- 标题、收藏、标签等元数据变化不生成新 NoteVersion；
- 相同 `rawMarkdown` 的重复保存复用既有 NoteVersion；
- 只有正文内容哈希真正变化时，才把旧 Annotation、KnowledgeEvidence 和 QuestionSource 标记为 stale；
- 这样可以避免自动保存或重复提交制造虚假的审核队列。

### 4.6 并发与维护门禁

#### local-json

- 继续使用同步 `runTransaction`、同目录临时文件、`fsync` 和原子替换；
- Note 更新接受 `expectedUpdatedAt`，过期令牌返回 `NOTE_UPDATE_CONFLICT`，避免同一进程内旧草稿覆盖新内容；
- 整批删除先预检再提交，事务失败恢复内存集合和磁盘文件；
- local-json 仍然不具备跨进程文件锁。不得把本阶段的进程内保护描述为多实例安全。

#### PostgreSQL

- 不涉及外部文件 I/O 的普通 knowledge 读取使用共享 advisory transaction lock，普通写入使用独占 advisory transaction lock；
- advisory lock 在 `Serializable` 控制事务中持有，直到被包装的纯数据库 handler 结束；
- 进程内 maintenance gate 会先排空活动请求，再让整库 import/export 独占运行；维护等待期间不接受新的普通操作插队；
- 多个 maintenance 请求自身按 FIFO 串行；活动请求排空时不能让多个等待者同时进入维护区；
- 附件、永久删除 Note 和清空回收站可能执行文件 I/O，不进入 advisory transaction；它们作为 ordinary operation/mutation 纳入 maintenance gate，使整库维护能够等待其完成并阻止维护期间的新操作，文件型 mutation 彼此串行；
- JSON → PostgreSQL apply 的数据库阶段取得同一独占 advisory lock；
- Prisma advisory query 显式把双参数锁键绑定为 PostgreSQL `integer`，并把锁函数的 `void` 返回转换为可反序列化文本，避免真实数据库上的 `42883` 与 Prisma `P2010`；
- 目标库 empty-check、replaceExisting 清理和新数据写入位于同一个 Serializable 事务，消除“检查为空后被其他请求写入”的窗口；
- migration apply 的附件文件 swap 在上述数据库事务外执行，但 maintenance gate 覆盖完整 apply 生命周期，确保同进程请求在数据库替换和文件切换期间都不能插队；
- Note 更新在 Repository 层使用 `id + expectedUpdatedAt` 条件更新；受影响行数为 0 时返回冲突；
- 应用层同级名称检查只负责友好错误，migration 4 的数据库唯一索引才是并发最终防线。

双层门禁职责不同：

```text
maintenance gate
→ 解决同一 Node 进程内普通请求与整库维护的排队

PostgreSQL advisory lock
→ 解决纯数据库 knowledge 请求和 migration 数据库阶段的多进程 / 多实例互斥

唯一索引 + 条件更新
→ 解决最终数据约束和 lost update
```

文件型操作仍要求部署层保持单一 active maintenance owner。maintenance gate 是进程内协议，不把共享 uploads 目录变成多实例安全文件系统。

## 5. PostgreSQL migration 4

迁移目录：

```text
prisma/migrations/4_phase32_hardening/
└── migration.sql
```

### 5.1 迁移内容

migration 4 不新增业务实体或 API 字段，只增加两个活动 Note partial unique index：

```text
Note_active_root_spaceId_title_key
  唯一键：spaceId + title
  条件：folderId IS NULL AND deletedAt IS NULL

Note_active_folder_spaceId_folderId_title_key
  唯一键：spaceId + folderId + title
  条件：folderId IS NOT NULL AND deletedAt IS NULL
```

根目录和普通文件夹必须分开建索引，因为 PostgreSQL 普通 unique index 会把 `NULL` 视为彼此不同，单一 `(spaceId, folderId, title)` 索引不能阻止根目录重名。

软删除 Note 不占用活动名称；恢复 Note 时重新接受唯一约束。

### 5.2 部署前门禁

1. 停止或排空生产写入，建立维护窗口；
2. 备份 PostgreSQL，并保留当前 JSON 与 uploads 快照；
3. 查询现有活动 Note 是否存在同空间、同目录、同标题重复；
4. JSON 迁移预检必须没有 `NOTE_NAME_CONFLICT`；
5. 对重复数据作人工处置，不能通过修改 migration 绕过；
6. 执行 `npm run prisma:validate` 和 `npm run prisma:generate`；
7. 确认当前数据库已应用 migration 0～3。

只读重复检查应同时覆盖：

```text
根目录：spaceId + title，folderId IS NULL，deletedAt IS NULL
普通目录：spaceId + folderId + title，folderId IS NOT NULL，deletedAt IS NULL
```

### 5.3 部署与验收

```bash
npm run prisma:migrate:deploy
```

部署后必须：

- `prisma migrate status` 显示 `4_phase32_hardening` 已应用；
- 两个 partial unique index 均存在；
- 根目录并发创建重名 Note 只有一个成功；
- 普通目录并发创建重名 Note 只有一个成功；
- 已软删除的同名 Note 不阻止新建，但恢复时仍受约束；
- Repository 将数据库唯一冲突映射为稳定的 `409 SIBLING_NAME_CONFLICT`。

### 5.4 回滚边界

migration 4 没有数据重写。若部署失败，先保持应用停止写入并恢复数据库备份；只有在明确接受失去并发同级名称保护时，才可在维护窗口显式删除两个索引。

不要在业务代码启动时自动 drop/recreate index，也不要把数据库约束失败静默降级成应用层预查。

## 6. 双驱动一致性要求

| 领域行为 | local-json | PostgreSQL |
| --- | --- | --- |
| 单 owner 启动 | 从配置或唯一存量 owner 解析；混合 owner 拒绝 | 连接后先审计存量空间；外来 owner 拒绝 |
| 快照导入 owner | `assertSpacesOwnedBy` 后原子替换 | owner 预检后由 maintenance gate 独占；数据库 replace 与事务外文件切换分离 |
| Note stale update | `expectedUpdatedAt` 应用层校验 | `expectedUpdatedAt` + 条件 update |
| Note 同级名称 | 应用服务校验，单进程同步提交 | 应用服务校验 + migration 4 唯一索引 |
| Note 永久删除 | 正式来源阻止；无引用版本同事务清理 | 外键/服务门禁保持正式来源历史 |
| 正式资产确认 | 共享 confirm validator | 相同 validator 与异步服务语义 |
| QuestionSource 健康 | 从当前内存引用推导 | 从数据库引用推导 |
| 附件路径 | 规范托管路径、原子文件操作 | 同一托管路径规则 + pending/ready |
| 整库导入 | 单进程同步原子数据替换与附件补偿 | maintenance gate 排空；数据库 replace 与事务外附件补偿分离 |
| 迁移 apply | 本地源只读预检 | maintenance gate 覆盖全程；数据库阶段独占 advisory + Serializable，文件 swap 在事务外 |
| 跨进程安全 | 不保证，仍是 local-first 开发/回退路径 | 纯数据库请求由 advisory lock、唯一索引和条件更新保护；文件型维护仍要求单 active owner |

“双驱动一致”指领域结果、错误码、来源状态和回滚语义一致，不表示 local-json 获得了 PostgreSQL 的多实例并发能力。

## 7. 主要实现落点

### Note、owner 与并发

- `apps/api/src/infrastructure/owner-boundary.js`
- `apps/api/src/infrastructure/maintenance-gate.js`
- `apps/api/src/infrastructure/postgres-advisory-lock.js`
- `apps/api/src/app.factory.js`
- `apps/api/src/postgres-app.factory.js`
- `apps/api/src/modules/knowledge/application/note-service.js`
- `apps/api/src/modules/knowledge/application/postgres-async/note-service.js`
- `apps/api/src/modules/knowledge/application/note-deletion-coordinator.js`
- `apps/api/src/modules/knowledge/infrastructure/postgres/note-repository.js`

### 快照、迁移与数据库约束

- `apps/api/src/modules/knowledge/application/knowledge-base-snapshot-service.js`
- `apps/api/src/infrastructure/postgres-snapshot-service.js`
- `apps/api/src/infrastructure/migration/json-to-postgres.js`
- `apps/api/src/infrastructure/migration/json-transformers.js`
- `prisma/migrations/4_phase32_hardening/migration.sql`

### 附件

- `apps/api/src/infrastructure/local-attachment-file-manager.js`
- `apps/api/src/infrastructure/local-attachment-store.js`
- `apps/api/src/infrastructure/postgres-attachment-store.js`
- `apps/api/src/infrastructure/local-attachment-snapshot-validator.js`
- `apps/api/src/http/storage-routes.js`

### 正式资产

- `apps/api/src/modules/knowledge/application/formal-asset-validation.js`
- `apps/api/src/modules/knowledge/application/knowledge-item-service.js`
- `apps/api/src/modules/knowledge/application/learning-objective-service.js`
- `apps/api/src/modules/knowledge/application/question-service.js`
- `apps/api/src/modules/knowledge/application/postgres-async/`
- `apps/api/src/infrastructure/local-data-relations.js`

## 8. 验收矩阵

最终收口逐项记录可复跑证据；以下计数和 PostgreSQL smoke 均来自整合完成后的最终验证，不使用并行过程中的临时结果。

| 验收域 | 必测场景 | 预期结果 | 当前记录 |
| --- | --- | --- | --- |
| Note 永久删除 | 无正式来源的 Note 永久删除后重启 | Note、NoteVersion、标注和附件元数据一致；无 `STORAGE_SNAPSHOT_INVALID` | 通过：持久化重启回归纳入 API 210/210；Evidence 与直接题目来源均受保护 |
| 回收站原子性 | 回收站同时含受保护和可删除 Note | 整批先预检；受保护时任何 Note 都不被部分删除 | 通过：双驱动整批预检；真实 PostgreSQL 直接 QuestionSource 场景无部分删除 |
| owner 启动 | local-json / PostgreSQL 含外来或混合 owner | 启动拒绝，返回 `OWNER_BOUNDARY_VIOLATION` | 通过：双驱动单测；真实 PostgreSQL `demo` owner 启动通过 |
| owner 导入 | 导入快照 owner 与 server owner 不一致 | 导入前拒绝；原数据和附件不变 | 通过：导入门禁回归与安全 fixture 往返通过 |
| 附件路径 | 绝对路径、`..`、路径段注入 | 读取、删除、迁移和导入全部拒绝 | 通过：local/迁移负测；5 个现有附件审计均 ready |
| 符号链接 | 托管名或旧目录同名项是 symlink | 不读取、不迁移、不删除链接目标 | 通过：托管目录与旧目录 symlink 负测 |
| 附件路由 | 合法 attachment path 后附加额外分段 | 返回 404，不误命中 content/delete | 通过：真实 HTTP 路由负测 |
| PostgreSQL 附件补偿 | ready 写入失败且 pending 行回滚/消失 | 新文件被清理，不留下孤儿 | 通过：失败注入回归 |
| Note lost update | 使用旧 `expectedUpdatedAt` 更新 | 两驱动都返回 `409 NOTE_UPDATE_CONFLICT` | 通过：双驱动回归；真实 PostgreSQL 条件更新返回同一错误码 |
| Note 名称并发 | 根目录/普通目录并发创建同名 Note | 数据库最多一条活动记录；冲突映射为 409 | 通过：真实 PostgreSQL 两类 partial unique index 均为一成一败，失败为 `SIBLING_NAME_CONFLICT` |
| 快照维护隔离 | 普通写入与 import/export 并发 | maintenance gate 先排空并独占；普通请求等待；文件 I/O 不进入 advisory transaction | 通过：普通请求排空、多 maintenance 串行回归；临时 uploads + 真实 PostgreSQL 安全 fixture 往返通过 |
| 迁移 apply 隔离 | empty-check 后有并发写入尝试 | 检查、replace、写入在同一独占 Serializable + advisory 事务；文件 swap 在事务外 | 通过：事务回归、真实 shared/exclusive 跨连接阻塞及安全 fixture apply |
| 重复客户端 ID | 重复创建正式资产 | 返回稳定 `*_ID_CONFLICT`，不覆盖旧对象 | 通过：local/PostgreSQL async create 回归 |
| 正式 KnowledgeItem | confirmed 但缺内容或有效来源 | service、snapshot、migration 均拒绝 | 通过：共享 validator 与双驱动回归 |
| 正式 Objective | 模糊动作或认知层级不匹配 | 确认与导入均拒绝 | 通过：共享 validator 与双驱动回归 |
| 正式 Question | 目标未确认、来源不健康、option ID 重复 | 确认与导入均拒绝 | 通过：共享 validator 与双驱动回归 |
| 上游失效 | 目标归档/退回、Evidence 失效、NoteVersion 过期 | QuestionSource stale；confirmed Question 降为 candidate | 通过：双驱动回归；真实 PostgreSQL 全链路级联结果一致 |
| 相同正文保存 | 重复提交相同 rawMarkdown | 不新建版本，不制造 stale 来源 | 通过：Note/NoteVersion/来源联动回归 |
| 双驱动对照 | 同一 fixture 在 local-json / PostgreSQL 执行 | 状态、错误码、DTO 和回滚语义一致 | 通过：API 回归与真实 PostgreSQL formal asset smoke；历史数据发布阻塞见 8.2 |

### 8.1 最终验证命令

```bash
npm run test:api
npm run test:web
npm run test:scripts
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:deploy
git diff --check
```

最终收口记录：

```text
API：210/210 通过
Web：131/131 通过
Scripts：9/9 通过
Prisma validate/generate：通过（Prisma Client 6.19.3）
Migration 0～4 deploy/status：隔离 PostgreSQL 16 通过，5 个 migration 全部 applied，schema up to date
PostgreSQL smoke：owner、真实 advisory 阻塞、JSON apply、安全快照往返、两类 Note 唯一索引、lost update、正式资产级联均通过
```

本阶段没有新的前端页面，不要求新增视觉验收；Web 全量测试用于确认既有资料、知识和训练工作域没有回归。

### 8.2 历史数据阻塞解除

取得用户确认并完成 `storage/data/knowledge-base.json` 与 `storage/uploads/`
备份后，已执行 `scripts/migrate-transformer-http-images.mjs --apply`，将
`note-transformer-1781768288411` 中的历史 HTTP 图片全部迁移为本地附件：

```text
noteId: note-transformer-1781768288411
不安全 HTTP 图片引用：7 处 → 0 处
涉及唯一外部图片：7 个 → 7 个本地附件
```

迁移中发现脚本清单漏列 2 个实际图片 URL，且 PATCH 被拒后不会补偿已上传附件；
现已补齐 7 项清单、按真实成功状态触发失败清理，并新增 PATCH 拒绝回滚测试。
首次失败产生的 5 个附件记录与文件已精确删除，随后重新迁移成功。

最终检查结果：

```bash
不安全 HTTP 图片引用：0
JSON → PostgreSQL 预检：ready
附件：12 ready / 0 missing / 0 corrupt / 0 pending / 0 orphan
API：210/210
Web：131/131
脚本：10/10
Prisma validate/generate：通过
```

另有 1 条历史 `ANNOTATION_VERSION_UNRESOLVED` 警告；该标注无法安全绑定到
NoteVersion，按既定策略保留为非阻断警告，不自动猜测修复。

## 9. 发布准入

只有以下条件全部满足，Phase3.2 才能标记为完成：

1. 验收矩阵所有“正在整合/待确认”项均有最终结论；
2. API、Web、脚本和 Prisma 门禁全部通过；
3. migration 4 在隔离 PostgreSQL 上完成幂等 deploy/status 和并发唯一性验证；
4. local-json 与 PostgreSQL 的 owner、正式资产和 Note 更新错误语义一致；
5. 附件完整性报告不存在未解释的 unsafe path、symlink、missing、corrupt、pending 或 orphan；
6. 整库 import/export 与普通请求的并发测试通过；
7. 生产切换前完成 JSON、uploads 和 PostgreSQL 三份可恢复备份（不阻断本次代码版本）；
8. `docs/工程变更日志.md` 已从 `[Unreleased]` 归档到最终版本段；
9. 根、API、Web 三个 `package.json` 同步更新为同一版本；
10. 仅在用户单独要求后创建 `v2.12.0` tag，Agent 不自行打 tag。

当前代码、数据预检与隔离数据库门禁均已通过，根、API、Web 三个
`package.json` 已同步为 `2.12.0`。第 7 项中的 PostgreSQL 备份和第 10 项标签
属于生产切换/发布动作，不在本次提交范围内；不得据此直接执行生产写入。

## 10. 未纳入项

- 不新增 `ExamBlueprint`、`Exam`、`ExamQuestionSnapshot`、`Attempt` 或 `Response`；
- 不新增 `GradeResult`、`LearningEvidence`、`MasteryState` 或 `ReviewSchedule`；
- 不接入 AI、AIJob、RAG、Embedding、Citation 或知识图谱；
- 不改前端信息架构、页面或视觉系统；
- 不实现正式登录、会话、CSRF、多用户权限或组织协作；
- 不引入 OSS/CDN、附件去重、后台垃圾回收或跨存储复制；
- 不把 local-json 扩展成多进程共享数据库；
- 不执行生产 PostgreSQL 切换或生产数据写入；
- 不自动修复不确定的历史 Annotation 定位；
- 不改变领域冻结稿中的掌握度、遗忘曲线或复杂题型边界。

## 11. 下一阶段

Phase3.2 完成并通过发布准入后，后端再进入：

```text
Phase4A
ExamBlueprint
→ Exam
→ ExamQuestionSnapshot
→ Attempt
→ Response
```

随后才进入：

```text
Phase4B
GradeResult
→ LearningEvidence
→ MasteryState
→ ReviewSchedule
```

Phase4A 不得绕过本阶段建立的 owner、正式资产、不可变来源、并发和维护门禁。
