# Phase2.0：知识来源与知识单元基础规划

> 文档状态：实施完成收口稿（2026-07-28）
> 适用范围：NoteVersion、来源定位、KnowledgeEvidence、KnowledgeItem 候选与确认
> 前置阶段：阶段 0 已完成；Phase1.0 PostgreSQL 基础设施已完成本地验证，生产切换仍有独立门禁
> 领域基准：[Knowra 知识与考卷系统领域冻结稿](Knowra%20知识与考卷系统领域冻结稿.md)

> 本阶段的任务边界是建立“可追溯的知识来源 + 可确认的知识单元”最小闭环。它不是试卷阶段，也不是 AI/RAG 阶段。任何与本文冲突的旧总控文档、旧知识链路方案或 `AssessmentPoint` 方案均不作为实施依据。

## 1. 当前状态与阶段定位

### 1.1 已具备的基础

- 阶段 0 已完成单用户边界、JSON 原子持久化、附件基础可靠性、前端保存竞态保护和旧 KnowledgePoint 链路退役。
- Phase1.0 已提供 PostgreSQL Schema、异步 Repository、JSON → PostgreSQL 迁移工具和附件完整性门禁。
- 本地 PostgreSQL 已完成迁移演练；历史缺失截图中已有 5 个从云服务器恢复并通过哈希校验，且已通过显式完整性修复写回 `ready`、SHA-256 与 `verifiedAt`，第 6 个附件经服务器项目、发布备份和常见路径检索仍未找到，已按负责人决定从本地迁移源中删除，不伪造文件或迁移记录。
- 当前稳定能力仍然是 Note、Folder、Tag、Attachment、ContentAnnotation 及其现有编辑器/导航流程。

### 1.2 为什么下一阶段先做来源与知识单元

领域冻结稿要求：

```text
Note ≠ KnowledgeItem
Annotation 不是 KnowledgeItem 的唯一前置
KnowledgeItem → LearningObjective → ExamFocus → Question
```

因此，在实现学习目标、试题和试卷之前，必须先解决两个问题：

1. 知识是从哪一版笔记、哪一段内容产生的；
2. 一个知识候选如何被创建、修改、确认、修订或归档。

如果跳过这两个问题，后续 AI 提炼、出题和批改都会失去可靠来源，且会再次把笔记、标注和知识点混为一体。

### 1.3 Phase2.0 实施结果

本阶段已按本规划和领域冻结稿完成最小闭环，实际落地范围如下：

- 新增不可变 `NoteVersion`，Note 正文保存时按内容哈希去重，并在 JSON 原子快照或 PostgreSQL 事务中与 Note 一起提交；
- 新增 `KnowledgeItem` 与 `KnowledgeEvidence`，支持候选、编辑、确认、需修订、归档和显式恢复；
- 新增来源回链：`noteVersion`、`annotation`、`manual` 三种来源均经过应用服务校验，正文变化、标注失效和 Note 删除会更新来源状态，不删除 KnowledgeItem；
- local-json 与 postgres 均接入新 Repository、HTTP handler、快照导入导出和迁移转换；PostgreSQL additive migration 已在本地 Docker 开发库完成部署；
- 右侧重要内容面板增加版本、候选知识点、来源状态、编辑/确认/归档/恢复和标注回链入口，未引入新的前端框架或独立知识图谱页面；
- 历史 JSON 仅生成每篇 Note 一个 baseline 版本；无法可靠绑定的历史 Annotation 继续进入迁移报告，不静默改写定位。

当前仍保持 `local-json` 为默认驱动；生产 PostgreSQL 切换不属于本次实施动作。第 6 个无法恢复的截图附件已从本地 JSON 迁移源中显式移除，严格迁移预检已不再被附件缺失阻断；仍保留 1 条历史 Annotation 无法安全绑定 baseline NoteVersion 的警告，需后续人工复核。

## 2. 阶段目标

Phase2.0 完成后，应形成以下闭环：

```text
保存 Note
  ↓
生成不可变 NoteVersion
  ↓
用户从笔记/选区/标注创建 KnowledgeItem 候选
  ↓
保存 KnowledgeEvidence 与来源定位
  ↓
用户编辑并确认 KnowledgeItem
  ↓
笔记修改或删除时，来源可被识别为有效、过期或失效
```

本阶段只要求“可追溯、可确认、可回链”，不要求自动生成知识或自动出题。

## 3. 冻结的边界原则

### 3.1 Note 仍是原始资料载体

Note 保存当前可编辑正文；NoteVersion 保存特定时间点的可追溯快照。KnowledgeItem 不复制成另一份笔记，也不取代 Note。

### 3.2 Annotation 只是来源入口之一

以下入口均可创建 KnowledgeItem 候选：

- 当前编辑器选区；
- 已有 ContentAnnotation；
- 当前标题章节；
- 整篇 Note；
- 用户手动创建；
- 后续的合并、拆分、错题分析或外部导入。

本阶段至少实现“当前选区/标注/手动创建”三条入口；章节、整篇、合并拆分和外部导入只保留接口边界，不展开复杂交互。

### 3.3 来源必须指向版本，而不是只指向当前 Note

正式 KnowledgeEvidence 至少要记录 `noteVersionId` 或明确的人工来源标记。只保存 `noteId` 无法回答“知识产生时依据的是哪一版正文”。

### 3.4 KnowledgeItem 必须先候选、后确认

- 用户手动创建的知识也先进入 `candidate`，除非使用明确的正式确认操作。
- AI 相关字段可以保留未来扩展，但本阶段不接入外部 AI，也不允许通过假造 AI 结果绕过候选状态。
- `confirmed` 不是简单的 UI 勾选，必须满足标题、核心陈述和来源/人工来源声明等领域校验。

### 3.5 来源失效不删除知识

删除 Note、修改正文或删除 Annotation 时，只更新来源证据状态或定位状态；不得自动删除 KnowledgeItem。正式知识对象的生命周期独立于某一条 Annotation。

## 4. 本阶段纳入范围

| 范围 | 本阶段交付 | 说明 |
| --- | --- | --- |
| NoteVersion | 最小不可变版本模型、写入规则、查询接口 | 不记录每次键盘输入，只记录有效保存或明确快照点 |
| 来源定位 | 版本、引用文本、章节路径、偏移/前后文、内容哈希 | 为来源复核和正文变更后的 stale 检测服务 |
| Annotation 对齐 | 新标注绑定 NoteVersion；旧标注安全回填或标记 stale | 不把 Annotation 改名为知识点 |
| KnowledgeItem | 候选、编辑、确认、需要修订、归档 | 先实现手动/选区/标注入口，AI 只保留未来边界 |
| KnowledgeEvidence | 一对多、多对一来源关系、来源状态和回链 | 第一阶段关系类型以 `supports` 为主 |
| 双驱动持久化 | local-json 与 postgres 都能保存和读取新实体 | 默认行为仍为 local-json，不做静默降级 |
| 迁移与回填 | JSON schema 扩展、PostgreSQL additive migration、基线版本回填 | 不虚构历史 NoteVersion；报告所有歧义 |
| 最小 UI | 候选/确认列表、详情、来源回链、版本/过期提示 | 保持现有模块化单体和三栏笔记体验 |
| 自动化验证 | 领域规则、双 Repository、HTTP、迁移、回归测试 | 现有笔记/附件测试必须保持通过 |

## 5. 明确排除范围

以下内容不得在 Phase2.0 中实现为正式功能：

- `LearningObjective`、`ExamProfile`、`ExamFocus`；
- `Question`、`ExamBlueprint`、`Exam`、`Attempt`、`Response`、`GradeResult`；
- `LearningEvidence`、`MasteryState`、`SelfAssessment`、`ReviewSchedule`；
- 自动知识提炼、批量 AI 分析、外部模型调用、Prompt 管理和 AI Job；
- RAG、DocumentChunk、KeywordIndex、Embedding、向量检索和 Graph RAG；
- KnowledgeTopic、KnowledgeRelation 和独立知识图谱 UI；
- 知识合并/拆分的复杂工作流；
- 文件上传、对象存储、OSS/CDN、附件去重和附件垃圾回收；
- 正式登录、多用户权限和新的部署架构；
- 将当前模块化单体改造成微服务或引入新的前端框架。

本阶段可以为上述对象预留稳定 ID、来源类型和应用服务边界，但不能提前实现其业务语义。

## 6. NoteVersion 设计边界

### 6.1 最小字段

按照领域冻结稿，第一版只冻结以下字段：

```text
id
noteId
content
contentHash
createdAt
createdBy
```

实现时可以增加数据库主键索引、唯一约束和审计字段，但不得把题目、掌握度或 AI 输出直接塞入 NoteVersion。

### 6.2 版本生成规则

采用“内容变化才生成 + 明确操作可生成”的规则：

1. Note 成功保存后，如果正文 `contentHash` 与当前版本不同，则在同一持久化边界内生成一个 NoteVersion。
2. 相同内容的重复保存不得制造重复版本。
3. 进入分析、正式知识确认等明确快照点时，可以复用已有同哈希版本，不重复生成。
4. 保存失败、事务回滚或附件操作失败时，不得留下“看似成功”的 NoteVersion。
5. NoteVersion 创建后不可编辑；需要修改时创建新版本。

JSON 驱动使用一次原子快照提交 Note 与 NoteVersion；PostgreSQL 驱动使用数据库事务提交 Note 与 NoteVersion。文件系统和外部 AI 不进入该事务。

### 6.3 历史数据回填

当前历史 JSON 没有可恢复的版本历史，因此只创建每个 Note 的一个 `baseline` 版本：

- 内容取迁移时的当前 Note 正文；
- `contentHash` 重新计算；
- `createdBy` 使用系统迁移标记；
- 时间使用可解释的 Note 时间字段；
- 不声称这就是用户过去真实保存过的历史版本。

已有 Annotation 只有在其内容哈希/定位能够与 baseline 对齐时才自动绑定；无法可靠对齐的 Annotation 保留原记录并标记 `stale`，不得静默改写选区。

### 6.4 删除与保留

- Note 软删除时保留 NoteVersion，以便审计和来源诊断；相关证据进入 `invalid` 或 `insufficient`。
- 对已经被正式 KnowledgeEvidence 引用的 Note，不允许通过现有“清空回收站即级联删除”的路径静默抹掉来源；需要显式确认并执行来源失效策略。
- 无正式知识引用的旧 Note，继续兼容当前回收站行为，但必须确保不会破坏其他实体引用。

## 7. KnowledgeEvidence 设计边界

### 7.1 最小字段与来源类型

字段以冻结稿为基准：

```text
id
knowledgeItemId
sourceType
sourceId
noteId
noteVersionId
quoteText
headingPath
relationType
createdAt
```

Phase2.0 只实现以下来源类型：

| sourceType | 用途 | 最小要求 |
| --- | --- | --- |
| `noteVersion` | 来源是一版 Note 的正文或章节 | 必须有 `noteVersionId`，最好带章节/引用文本 |
| `annotation` | 来源来自已有正文标注 | 必须有 Annotation 与对应 NoteVersion |
| `manual` | 用户明确声明的人工来源 | `sourceMode=manual`，确认时必须明确显示“无正文来源” |

`selection`、`heading`、`folder`、`external` 等可以作为未来请求输入，但本阶段落库时必须归一到可追溯的 NoteVersion 或明确人工来源，不能保存成无定位的临时字符串。

### 7.2 来源状态

为满足冻结稿“删除 Note 后来源失效或来源不足”的规则，本阶段需要冻结最小状态语义：

```text
valid
stale
invalid
insufficient
```

- `valid`：来源版本和定位仍可复核；
- `stale`：正文版本仍在，但引用文本/偏移与当前内容不再可靠；
- `invalid`：来源 Note 已删除、版本被明确作废或引用实体不存在；
- `insufficient`：人工来源或现有来源不足以支撑正式确认。

状态变化必须可解释，不能因为列表查询失败就把证据标记为失效。

### 7.3 来源变更处理

- Note 新版本生成后，不修改旧 Evidence 的 `noteVersionId`。
- 系统可以重新检查引用文本、章节路径、前后文和哈希，失败时标记 `stale`。
- 用户确认新的定位后，追加新的 Evidence 或创建新版本的来源记录；不覆盖历史来源。
- 删除 Annotation 不删除 Evidence；如果 Evidence 仅依赖该 Annotation，则标记为 `invalid` 或 `insufficient`，KnowledgeItem 仍保留。

## 8. KnowledgeItem 设计边界

### 8.1 最小字段

```text
id
title
canonicalStatement
userExplanation
knowledgeType
importance
reviewStatus
sourceMode
createdAt
updatedAt
deletedAt
```

第一版 `knowledgeType` 使用冻结稿建议值：`concept`、`fact`、`principle`、`process`、`algorithm`、`formula`、`comparison`、`application`。

### 8.2 状态与操作

| 状态 | 允许操作 | 约束 |
| --- | --- | --- |
| `candidate` | 编辑、补充来源、确认、标记需修订、归档 | 可以不完整，但必须能追溯创建来源或明确为手动候选 |
| `confirmed` | 编辑、标记需修订、归档 | 必须有标题、核心陈述和至少一个有效来源，或明确人工来源声明 |
| `needsRevision` | 编辑、补充来源、重新确认、归档 | 不能进入未来正式出题范围 |
| `archived` | 查看、显式恢复为候选 | 不做物理删除，不影响历史 Evidence |

确认操作必须由应用服务统一执行，HTTP 层不能通过直接更新 `reviewStatus` 绕过校验。

### 8.3 本阶段创建方式

最小创建流程：

```text
当前选区 / Annotation / 手动输入
→ 捕获对应 NoteVersion
→ 创建 candidate KnowledgeItem
→ 创建 KnowledgeEvidence
→ 用户编辑 canonicalStatement
→ 用户显式确认
```

本阶段不提供 AI 自动填充，但保留 `sourceMode` 和候选状态，使后续 AI 能作为候选生产者接入，而不改变确认规则。

## 9. 持久化、Repository 与迁移方案

### 9.1 数据库模型

新增最小 PostgreSQL 模型：

- `NoteVersion`：`Note` 一对多；版本不可变；按 `noteId + contentHash` 建查重索引；
- `KnowledgeItem`：独立生命周期；`reviewStatus`、`sourceMode`、软删除字段；
- `KnowledgeEvidence`：关联 `KnowledgeItem`、Note/NoteVersion/Annotation；按知识点和来源建立查询索引。

不在本阶段新增 KnowledgeRelation、LearningObjective 或题目相关表。

### 9.2 JSON schema

本地 JSON 新增：

```text
noteVersions: []
knowledgeItems: []
knowledgeEvidence: []
```

采用显式 `schemaVersion` 迁移：

- 旧 `schemaVersion: 1` 读取时补齐空集合；
- 显式写入或迁移时升级到下一版本；
- 不在 API 启动时偷偷重写用户文件；
- 导入、导出、校验和回滚同时覆盖三组新集合。

### 9.3 Repository 结构

继续保持模块化单体分层：

```text
domain
  note-version.js
  knowledge-item.js
  knowledge-evidence.js

application
  note-version-service.js
  knowledge-item-service.js
  （KnowledgeEvidence 编排由 knowledge-item-service.js 及其 PostgreSQL 异步服务承担）

infrastructure
  local JSON repositories
  PostgreSQL repositories

http
  note-version routes
  knowledge-item routes
  evidence routes
```

服务层负责状态转换、来源校验和幂等；Repository 只负责持久化映射；HTTP 只负责输入输出适配。

### 9.4 事务边界

- `Note + NoteVersion` 的数据库记录在同一数据库事务中提交；JSON 通过同一原子快照提交。
- `KnowledgeItem + KnowledgeEvidence` 的确认操作在同一数据库事务中提交；JSON 路径一次性写入。
- 引用检查、哈希计算和数据库写入可以在应用边界内组合，但外部 AI、网络、对象存储和附件文件 I/O 不得放入数据库事务。
- 所有“创建候选”接口需要幂等键或内容哈希去重策略，重复点击不能创建不可解释的重复候选。

## 10. API 与最小界面边界

### 10.1 最小 API 能力

接口命名以现有手写路由和 response envelope 为准，当前已落地路径为：

- `GET /api/knowledge/notes/:noteId/versions`、`GET /api/knowledge/notes/:noteId/versions/:versionId`：查询 NoteVersion；
- `GET/POST /api/knowledge/items`、`GET/PATCH /api/knowledge/items/:id`：查询、创建候选和编辑 KnowledgeItem；
- `POST /api/knowledge/items/:id/confirm`、`/needs-revision`、`/archive`、`/restore`：执行受校验的状态变更；
- `GET/POST /api/knowledge/items/:id/evidence`：查询和创建 KnowledgeEvidence；
- `GET /api/knowledge/items?noteId=:noteId`：按当前 Note 查询带来源摘要的 KnowledgeItem，供右侧栏回链。

禁止新增“直接创建已确认 KnowledgeItem”的快捷接口，除非接口内部完成与确认操作相同的领域校验。

### 10.2 最小 Web 能力

已增加能验证闭环的最小界面：

- 笔记侧栏显示当前版本、来源状态和已有标注；
- 当前选区或标注可创建 KnowledgeItem candidate（手动候选由 API 保留）；
- 知识列表区分 candidate、confirmed、needsRevision、archived；
- 知识详情展示标题、核心陈述、解释、来源引用、来源状态和回链；
- 用户可以编辑、确认、标记需修订和归档；
- 来源失效或过期时显示明确状态，不静默隐藏知识。

不新增独立复杂知识图谱页面，不改写现有编辑器状态模型，不将缓存层变成第二个正式写入源。

## 11. 开发任务拆分

> 实施状态：工作包 A～F 已完成。以下任务拆分保留作为代码边界、验收映射和后续维护索引；没有把学习目标、试题、AI、RAG 或知识图谱提前并入本阶段。

### 11.1 工作包 A：领域决策与数据契约

- 冻结 NoteVersion 生成频率、不可变规则和 `createdBy` 语义；
- 冻结 Evidence 来源类型、来源状态和 Note 删除语义；
- 冻结 KnowledgeItem 状态转换、确认门禁和人工来源声明；
- 输出 API DTO、错误码、JSON schema 和 Prisma 草案；
- 禁止使用 `KnowledgePoint`、`AssessmentPoint` 作为新领域名称。

### 11.2 工作包 B：NoteVersion 与标注来源对齐

- 新增 NoteVersion domain、Repository、Service 和双驱动持久化；
- 将 Note 保存与版本生成接入现有草稿保存链路；
- 为 Annotation 写入 `noteVersionId` 和来源哈希；
- 实现旧 Annotation 的安全回填、stale 检测和不确定报告；
- 验证保存失败不会留下孤立版本。

### 11.3 工作包 C：KnowledgeItem 与 KnowledgeEvidence

- 新增候选创建、编辑、确认、需修订、归档服务；
- 新增 Evidence 创建、查询、来源状态校验和回链 DTO；
- 实现确认门禁：标题、核心陈述、有效来源/人工来源声明；
- 实现 Note/Annotation 删除或正文变化后的来源状态更新；
- 不加入 AI 生成和学习目标。

### 11.4 工作包 D：数据库迁移与双路径一致性

- 新增 PostgreSQL additive migration 和 Prisma mapping；
- 扩展 JSON schema、导入导出、原子回滚和校验报告；
- 为已有 Note 创建 baseline NoteVersion，不重建虚假历史；
- 对已有 Annotation 做可解释回填，无法定位的记录进入报告；
- local-json 与 postgres 使用同一组领域验收用例。

### 11.5 工作包 E：最小 UI 与回归保护

- 增加候选/确认知识的最小展示和操作；
- 增加来源回链、版本状态和 stale/invalid/insufficient 提示；
- 保持现有笔记编辑、标签、附件、搜索、回收站和导入导出行为；
- 增加请求序列、当前 Note 校验和保存失败保护，不引入新的全局状态分叉。

### 11.6 工作包 F：验收与交接

- API、Web、脚本测试和 Prisma 校验全部通过；
- JSON 与 PostgreSQL 各完成创建、编辑、确认、来源失效和恢复演练；
- 形成迁移报告、来源完整性报告和回滚记录；
- 更新项目结构导航、README、工程变更日志和本阶段文档；
- 输出下一阶段（学习目标与训练边界）的准入问题清单。

## 12. 阶段准入条件

开始编码前必须满足：

1. 领域冻结稿仍是当前基准，若要修改 NoteVersion 或 Evidence 语义，先更新冻结稿并重新评审；
2. Phase1.0 本地 PostgreSQL migration、Repository、附件检查和现有测试保持通过；
3. 生产 PostgreSQL 是否切换不作为本阶段的隐含前提，但本阶段不得修改生产数据或直接切换服务器驱动；
4. 缺失历史截图必须继续作为已知迁移风险记录；本次从云服务器恢复 5 个并通过尺寸/SHA-256 校验，第 6 个经检索无法恢复，已按负责人决定删除对应 JSON 元数据，不伪造文件、不绕过完整性门禁；
5. 确定新增实体在 local-json 和 postgres 两条路径的验收范围，避免只实现一条驱动；
6. 先确定 hard delete 对正式来源的保护规则，再修改 Note 删除流程；
7. 新增接口、字段和迁移必须保持模块化单体，不引入微服务、队列或新的前端框架。

## 13. 验收标准与退出条件

### 13.1 数据与领域验收

- 每个发生正文变化的 Note 都能生成唯一、不可变、可查询的 NoteVersion；相同内容重复保存不会重复生成版本；
- 新 Annotation 能绑定创建时的 NoteVersion；正文变化后旧 Annotation 不被静默迁移；
- KnowledgeItem 可以创建为 candidate，并能从选区、Annotation 或人工来源回到原始资料；
- confirmed KnowledgeItem 必须具备标题、核心陈述和有效来源，或明确人工来源声明；
- KnowledgeEvidence 支持一个来源支撑多个知识点、多个来源支撑一个知识点；
- 删除 Note/Annotation、正文变化或定位失败只改变 Evidence 状态，不自动删除 KnowledgeItem；
- 所有新状态变更均有明确错误码、幂等行为和回滚路径。

### 13.2 工程验收

- local-json 与 postgres 对同一领域用例给出一致的 API 语义；
- JSON schema 升级可回滚，旧数据可读取，导入不会静默丢失 Annotation 或附件；
- PostgreSQL migration 可重复部署，失败不留下半套正式知识数据；
- API、Web、脚本、Prisma、编辑器 bundle 和 `git diff --check` 通过；
- 现有 Note 编辑、保存失败保护、附件读取、标签、搜索、回收站和导入导出回归通过；
- 未出现旧 `KnowledgePoint`/`AssessmentPoint` 业务代码、路由或前端状态。

### 13.3 退出条件

只有以下条件全部满足，Phase2.0 才能标记完成：

1. NoteVersion、KnowledgeEvidence、KnowledgeItem 的领域规则和 API 契约已冻结；
2. 两种持久化驱动均完成闭环并通过回归；
3. 现有笔记功能没有新增数据损坏或上下文丢失；
4. 历史数据回填报告中的每一条警告都有处置结论；
5. 领域冻结稿中的来源、候选、删除和幂等规则均有自动化测试覆盖；
6. 形成下一阶段 LearningObjective/ExamFocus 的明确准入清单。

## 14. 风险与暂不决策项

### 14.1 版本数量增长

本阶段先使用内容哈希去重和按事件生成版本，不引入复杂保留策略。版本清理、压缩和归档在真实使用数据出现后单独评估。

### 14.2 来源定位不稳定

偏移量会因正文编辑失效，因此必须同时保存引用文本、章节路径、前后文和内容哈希。定位失败只能标记 stale，不能自动猜测新位置。

### 14.3 手动知识的来源不足

领域冻结稿允许明确人工来源，但不能把“无来源”默认为“来源有效”。本阶段必须在 UI 和数据中显示人工声明，并让后续正式确认/出题策略可以区分它。

### 14.4 KnowledgeItem 合并与拆分

本阶段只允许编辑和归档，不实现复杂合并/拆分。未来合并/拆分必须保留旧 KnowledgeItem、Evidence 和变更关系，不能通过覆盖 ID 处理。

### 14.5 生产切换与领域开发耦合

Phase1.0 生产 PostgreSQL 切换是独立发布任务。Phase2.0 可以在隔离的本地 PostgreSQL 上开发，但不能把本地成功直接等同于生产切换完成。

## 15. 阶段完成后的下一步

Phase2.0 完成后，下一阶段才进入：

```text
KnowledgeItem
→ LearningObjective
→ 可选 ExamFocus
→ Question / Paper
```

进入学习目标阶段前，必须再次确认：

- 学习目标是否包含可评测动作；
- 未确认目标是否被排除在正式出题范围之外；
- `ExamFocus` 是否只在具体考试语境下出现；
- Question 是否绑定至少一个 LearningObjective；
- 正式 Paper 是否保存不可变题目快照。

本阶段不提前回答掌握度公式、RAG 参数、图谱布局和 AI 自动化策略。

## 16. 实施收口记录

### 16.1 已交付文件边界

- Domain：`note-version.js`、`knowledge-item.js`、`knowledge-evidence.js`；
- Application：NoteVersion、KnowledgeItem 双驱动服务，以及 Note/Annotation 状态联动；
- Infrastructure：local-json Repository、PostgreSQL Repository、Prisma schema/migration、JSON schema/迁移转换和快照导入导出；
- HTTP：NoteVersion 查询、KnowledgeItem CRUD/状态动作、KnowledgeEvidence 查询/创建；
- Web：知识库 API service、右侧栏候选知识点和来源状态展示、确认/归档/恢复动作；
- Tests：领域/双 Repository/迁移/HTTP 相关 API 测试，以及 Web API/UI 回归测试。

### 16.2 已知未完成项

1. 原 6 个缺失截图附件中已有 5 个从云服务器恢复并通过尺寸/SHA-256 校验；剩余 `attachment-1782714688668-6e3f76` 在服务器项目目录、发布备份和常见文件系统路径中均未找到，已按负责人决定从 `storage/data/knowledge-base.json` 删除对应元数据，且未在服务器端做任何修改；
2. 历史 Annotation 中无法可靠绑定 baseline NoteVersion 的记录已保留为迁移警告，后续需要人工复核；
3. 生产 PostgreSQL 部署、备份恢复演练、访问控制和切换发布仍属于独立部署任务；
4. 下一阶段才进入 `KnowledgeItem → LearningObjective → ExamFocus（可选）→ Question`。

### 16.3 验收结论

Phase2.0 的代码闭环已完成，且保持当前模块化单体、local-json 默认行为和现有笔记编辑流程不变。第 6 个不可恢复附件已按负责人决定从本地迁移源中删除，严格迁移预检现已通过；生产 PostgreSQL 切换、远端数据写入和部署仍属于独立发布任务。

### 16.4 本次实施验证记录

- API 回归：`165/165` 通过；Web 回归：`129/129` 通过；脚本测试：`8/8` 通过；
- Prisma schema 校验、Client 生成和 3 个 migration 的幂等部署通过；本地 PostgreSQL 冒烟验证了 NoteVersion 生成、KnowledgeItem 确认和 Evidence `valid → stale` 联动；
- JSON → PostgreSQL 严格预检生成了 `40` 条 baseline NoteVersion；删除第 6 个无法恢复附件记录后，预检状态为 `ready`，附件错误为 `0`，仍保留 `1` 条历史 Annotation 无法安全绑定版本的警告；
- 本次仅修改本地迁移源以落实负责人对第 6 个附件的放弃决定，并修复已恢复 5 个附件的完整性元数据；未执行 PostgreSQL `--apply`，未修改服务器；附件修复报告保存在 `/tmp/knowra-attachments-after-drop-repair.json`，最终迁移预检报告保存在 `/tmp/knowra-phase2-migration-report-final.json`。
