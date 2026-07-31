# Phase3.1：四工作域前端与资产工作台规划

> 文档状态：Phase3.1 实施闭环记录（2026-07-29）
> 推荐发布版本：`2.11.0`（仅在实现和验收完成后升版）
> 适用范围：四工作域应用外壳、知识资产工作台、训练资产工作台、资料边栏收口和配套查询能力
> 前置阶段：Phase2.0、Phase3.0 领域与双驱动基础已完成
> 产品信息架构：[Knowra 前端工作域与页面规划](模块规划.md)
> 领域基准：[Knowra 知识与考卷系统领域冻结稿](Knowra%20知识与考卷系统领域冻结稿.md)

## 1. 阶段决策

下一阶段优先做前端产品化，并补齐少量只读查询能力，不继续扩张新的正式训练领域对象。

原因：

1. Phase2.0 已经具备 `NoteVersion`、`KnowledgeItem`、`KnowledgeEvidence`；
2. Phase3.0 已经具备 `LearningObjective`、`ExamProfile`、`ExamFocus`、`Question`、`QuestionObjective`、`QuestionSource`；
3. 当前前端仍把知识单元、学习目标和基础题目集中在资料编辑器右侧栏，无法承担跨资料筛选、集中审核和资产管理；
4. 如果立即继续实现 `Exam`、`Attempt`、`GradeResult`，新的领域能力仍会缺少稳定的用户工作区，前端债务会继续放大；
5. 先让用户真实管理知识、目标和题目，可以在进入正式训练执行前验证粒度、状态、来源和审核流程。

因此 Phase3.1 的定位是：

> 将已经完成的后端领域资产从“笔记右栏中的最小验证交互”升级为可长期使用的知识与训练工作台。

## 2. 当前基线

### 2.1 已有后端能力

- KnowledgeItem：候选、编辑、确认、需修订、归档、恢复；
- KnowledgeEvidence：来源类型、来源状态、NoteVersion/Annotation 回链；
- LearningObjective：候选、编辑、确认、需修订、归档、恢复；
- ExamProfile/ExamFocus：人工创建、编辑、确认、归档、恢复；
- Question：草稿、编辑、结构校验、候选、确认、归档、恢复；
- QuestionObjective：后端支持多目标关系；
- QuestionSource：后端支持知识、目标、版本、证据和人工来源；
- local-json 与 PostgreSQL 两条驱动保持同一领域语义；
- 现有 API 继续使用 `{ data }` / `{ error }` 信封。

### 2.2 已有前端能力

- 资料索引、资料编辑器和资料右侧栏已稳定；
- 当前资料可以加载 NoteVersion、KnowledgeItem、LearningObjective 和 Question；
- 可以从标注创建 KnowledgeItem 候选；
- 可以创建、编辑和确认 LearningObjective；
- 可以从单个 confirmed LearningObjective 创建基础 Question；
- 可以编辑题型、题干、参考答案和解析，并执行校验、确认、归档和恢复。

### 2.3 当前缺口

- 正式 SPA 仍使用旧的五入口占位 Rail；
- 没有独立的知识概览、知识单元、学习目标和审核队列页面；
- 没有独立的题目库、题目编辑器和考试场景页面；
- 前端没有开放多目标绑定、QuestionSource 管理和 ExamProfile/ExamFocus；
- 资料右侧栏混合标注、版本、知识、目标和题目编辑，信息密度已经超过上下文边栏应承担的范围；
- 现有列表 API 的搜索、组合筛选、分页和概览统计不足以直接支撑长期资产工作台。

## 3. 阶段目标与完成定义

### 3.1 阶段目标

1. 将一级导航收敛为 `01 资料`、`02 知识`、`03 训练`、`04 学习档案`；
2. 保留 01 资料现有索引与编辑主路径；
3. 建立 02 知识的概览、知识单元、学习目标和审核队列；
4. 建立 03 训练的概览、题目库、题目编辑和考试场景；
5. 将资料右侧栏收敛为当前资料的上下文入口、摘要、状态和回链；
6. 移除 AI、任务和复盘作为独立一级占位模块的旧表达；
7. 为列表页面提供稳定的搜索、筛选、分页和概览 DTO；
8. 不伪造掌握度、作答、批改、AI 或图谱能力。

### 3.2 完成定义

Phase3.1 只有在用户能够完成以下真实链路后才算完成：

```text
从资料创建知识候选
→ 在知识工作域集中编辑并确认
→ 创建和确认学习目标
→ 在训练工作域创建题目
→ 绑定一个或多个 confirmed LearningObjective
→ 管理题目来源
→ 校验并确认题目
→ 从知识或题目回到原始资料
```

仅完成导航改名、静态空页面或把右栏 HTML 搬到新容器，不算完成。

## 4. 阶段范围

### 4.1 本阶段纳入

| 范围 | 交付 |
| --- | --- |
| 应用外壳 | 四工作域 Rail、工作域状态、二级页面切换、模块 Header |
| 01 资料 | 保持现有资料索引和编辑器；收敛右侧知识上下文 |
| 02 知识 | 知识概览、知识单元、学习目标、审核队列 |
| 03 训练 | 训练概览、题目库、题目编辑器、考试场景 |
| 04 学习档案 | 冻结导航位置和真实依赖说明，不开放虚假掌握页 |
| API 查询 | 概览 DTO、组合筛选、稳定排序、分页、批量关联摘要 |
| 状态与错误 | 加载、空、保存失败、来源失效、审核门禁和只读模式 |
| 回归保护 | 资料编辑、附件、标注、保存竞态、导入导出和双驱动语义 |

### 4.2 明确排除

- `ExamBlueprint`、`Exam`、正式试卷和不可变题目快照；
- `Attempt`、`Response`、在线答题和计时；
- `GradeResult`、AI 批改和人工复核；
- `LearningEvidence`、`MasteryState`、`Misconception`、`ReviewSchedule`；
- AI 提炼、AI 出题、RAG、Embedding、Citation 和 AIJob；
- KnowledgeTopic、KnowledgeRelation 和知识图谱；
- 全局工作台的学习统计和今日复习；
- React 主路径迁移、路由库、微前端或新的状态框架；
- 生产 PostgreSQL 切换、登录、多用户权限和新的部署架构。

## 5. 信息架构与页面边界

### 5.1 全局导航

```text
01 资料
02 知识
03 训练
04 学习档案
```

- 全局工作台不占用编号；
- AI、RAG 和搜索不占用一级入口；
- 04 学习档案在依赖未落地前显示为不可进入状态，并说明真实依赖；
- 设置继续固定在工作域切换区域下方。

### 5.2 01 资料

保留：

- 资料索引；
- 文件夹、搜索、标签、收藏、最近和回收站；
- Markdown 编辑器、附件、大纲和标注；
- NoteVersion 与当前资料来源状态摘要。

右侧栏只保留：

- 从选区或标注创建知识候选；
- 当前资料关联的知识数量与状态；
- 来源失效提醒；
- 跳转到知识详情；
- 当前资料关联的目标和题目摘要。

右侧栏不再承载跨资料知识列表、完整 LearningObjective 编辑器和完整 Question 编辑器。

### 5.3 02 知识

#### 知识概览

- KnowledgeItem 状态计数；
- 来源 `valid/stale/invalid/insufficient` 计数；
- 缺少 confirmed LearningObjective 的知识数量；
- 最近更新和待处理摘要；
- 所有指标必须来自真实查询，不推导掌握度。

#### 知识单元

- 支持关键词、reviewStatus、knowledgeType、evidenceStatus 筛选；
- 中央连续列表展示标题、核心陈述摘要、类型、状态、来源健康和目标覆盖；
- 右侧详情检查器展示陈述、用户解释、来源、目标、题目摘要和状态动作；
- 支持创建人工候选、编辑、确认、需修订、归档和恢复；
- 来源回链可以打开对应 NoteVersion 或定位 Annotation。

#### 学习目标

- 跨知识单元查看全部 LearningObjective；
- 支持按状态、动作词、认知层级、父 KnowledgeItem 和是否已有题目筛选；
- 详情显示父知识、目标内容、reviewNote、关联 Question；
- 编辑 confirmed 目标后必须按后端规则回到 candidate；
- 未确认目标不能进入正式题目绑定。

#### 审核队列

统一呈现：

- candidate KnowledgeItem；
- needsRevision KnowledgeItem；
- stale/invalid/insufficient KnowledgeEvidence；
- candidate LearningObjective；
- 因目标或来源变化需要复核的 Question。

审核队列是多个正式实体的只读聚合和动作入口，不新增通用 `ReviewTask` 领域对象。

### 5.4 03 训练

#### 训练概览

- Question 状态和题型计数；
- 待校验、待确认、来源失效题目；
- ExamProfile 数量和最近更新；
- 不展示考试次数、分数或掌握度。

#### 题目库

- 支持关键词、questionType、reviewStatus、difficulty、LearningObjective 和来源状态筛选；
- 列表展示题干摘要、题型、状态、版本、主目标和来源健康；
- 右侧检查器展示目标、来源、参考答案/rubric、解析和状态动作。

#### 题目编辑器

- 支持四种 Phase3.0 题型；
- 支持选择一个或多个 confirmed LearningObjective；
- 支持设置主目标和排序；
- 支持管理 QuestionSource，而不是只自动生成单一目标来源；
- 保存、校验、提交审核、确认、归档和恢复必须走现有应用服务门禁；
- 保存失败时保留全部草稿输入，不伪造状态成功。

#### 考试场景

- ExamProfile 列表、创建、编辑、归档和恢复；
- ExamFocus 按 Profile 查看和维护；
- ExamFocus 只能关联 confirmed LearningObjective；
- 明确提示它是题目筛选上下文，不是正式试卷或训练记录。

## 6. 后端查询与 DTO 增强

本阶段不新增正式领域实体，只增强查询和前端视图 DTO。

### 6.1 概览查询

建议新增：

- `GET /api/knowledge/overview`
- `GET /api/knowledge/training-overview`

返回状态计数、来源健康计数、缺口计数和最近更新摘要。概览服务使用批量查询，不在循环内逐项查 Repository。

### 6.2 现有列表接口增强

继续沿用现有资源路径：

- `GET /api/knowledge/items`
- `GET /api/knowledge/learning-objectives`
- `GET /api/knowledge/questions`
- `GET /api/knowledge/exam-profiles`
- `GET /api/knowledge/exam-profiles/:id/focuses`

补齐：

- `query` 关键词；
- 资源对应的状态和类型筛选；
- 来源健康筛选；
- 缺少目标、缺少题目等明确布尔筛选；
- `limit` 与稳定 cursor；
- 明确的默认排序；
- 关联摘要批量返回，避免 Web 逐项请求。

### 6.3 契约原则

- HTTP 继续只做请求适配；
- 组合筛选和概览编排进入 application/read service；
- local-json 与 PostgreSQL 返回相同 DTO 语义；
- 不把 Prisma 对象、内部数组或持久化枚举直接泄露给 Web；
- 不为了概览修改正式领域对象；
- 列表和概览查询不产生业务写入。

## 7. 前端工程边界

### 7.1 状态模型

建议在现有全局 state 中新增命名空间，而不是继续增加平铺字段：

```text
navigation.activeWorkDomain
navigation.activeDomainView
knowledgeWorkspace.filters
knowledgeWorkspace.selection
knowledgeWorkspace.loadState
trainingWorkspace.filters
trainingWorkspace.selection
trainingWorkspace.loadState
```

不引入新的状态框架，也不把 DOM 当作业务状态真源。

### 7.2 Controller 与 View

建议边界：

```text
src/controllers/work-domain-controller.js
src/controllers/knowledge-workspace-controller.js
src/controllers/training-workspace-controller.js

lib/work-domains/
lib/knowledge-workspace/
lib/training-workspace/

src/services/knowledge-api/
```

- controller 负责编排请求、状态和渲染；
- `lib/*` 保存纯筛选、选择、视图状态和 HTML 渲染；
- API service 继续复用现有 requestJson 和 response envelope；
- 单文件接近 250 行时按页面或职责拆分；
- 不把新页面继续写入 `annotation-panel.js`。

### 7.3 视觉与交互

- 继续使用当前 Swiss Editorial Grid、钴蓝、象牙白、直角和规则线；
- 列表管理页采用左侧工作域目录、中部连续列表、右侧详情检查器；
- 不堆砌圆角统计卡片；
- 三栏各自独立滚动，不使用 window 全局滚动；
- 1280px 与 1440px 桌面视口均不得横向溢出；
- 加载、空、错误、来源失效、只读和保存失败状态必须有真实呈现；
- 键盘焦点、按钮禁用原因和状态文本必须可访问。

## 8. 开发任务拆分

### P3.1-00：固化 Phase2/3 基线

- 完成当前未提交的 Phase2/3 代码和文档审查；
- 运行 API、Web、脚本、Prisma、迁移和 `git diff --check`；
- 确认工作区与 `origin/main` 的领先/落后状态；
- 不在未固化的领域基线上并行重构前端。

完成标志：Phase2/3 形成可恢复、可复跑的稳定提交基线。

### P3.1-01：冻结查询契约与页面状态

- 冻结四工作域 key、二级页面 key 和 URL/内部状态策略；
- 冻结概览 DTO、筛选参数、分页 cursor 和排序；
- 冻结知识/训练详情检查器所需关联摘要；
- 补充非法筛选、未知 cursor 和只读模式错误契约。

完成标志：前后端可以独立按同一 DTO 开发，不在页面实现中临时发明字段。

### P3.1-02：应用外壳与四工作域导航

- 将旧五入口 Rail 迁移为四工作域；
- 建立 activeWorkDomain/activeDomainView 状态；
- 保持资料索引和编辑器现有跳转；
- 04 学习档案显示真实依赖说明；
- AI、任务和复盘不再显示为独立占位入口。

完成标志：四个工作域位置稳定，资料主路径无回归。

### P3.1-03：知识查询与知识单元工作台

- 实现知识概览 read service；
- 增强 KnowledgeItem 列表筛选、分页和来源摘要；
- 实现知识概览、知识单元列表和详情检查器；
- 接入编辑、确认、需修订、归档、恢复和来源回链。

完成标志：用户不进入某篇资料，也能管理全部 KnowledgeItem。

### P3.1-04：学习目标与审核队列

- 增强 LearningObjective 查询和题目覆盖摘要；
- 实现学习目标列表、详情、筛选和状态动作；
- 实现跨实体审核队列 read model；
- 保证审核动作仍调用各实体正式 application service。

完成标志：候选、来源问题和目标缺口可以集中发现并处理。

### P3.1-05：训练查询、题目库与题目编辑器

- 实现训练概览 read service；
- 增强 Question 列表筛选、分页、目标和来源摘要；
- 实现题目库、详情检查器和独立编辑器；
- 开放多目标绑定、主目标和 QuestionSource 管理；
- 接入题目校验、确认、归档和恢复。

完成标志：Phase3.0 后端题目能力不再受限于资料右栏最小表单。

### P3.1-06：考试场景

- 实现 ExamProfile 列表、详情和状态动作；
- 实现 ExamFocus 按 Profile 的创建、编辑、确认和归档；
- 提供目标回链和状态门禁错误；
- 不显示组卷、开始考试或成绩入口。

完成标志：人工考试语境可以被真实维护，并可供题目筛选使用。

### P3.1-07：资料右栏收口

- 保留标注、版本、知识候选入口和关联摘要；
- 将完整目标/题目编辑迁移到对应工作域；
- 增加“在知识中打开”“在训练中打开”跳转；
- 保持保存失败、请求序列和当前资料校验。

完成标志：资料边栏重新成为上下文工具，而不是资产管理页面。

### P3.1-08：测试、视觉 QA 与文档

- API 查询、筛选、分页、DTO 和双驱动对照测试；
- Web state、controller、渲染、交互和保存失败测试；
- 资料主路径、附件、标注、搜索、回收站、导入导出回归；
- 1280px/1440px 的知识与训练页面视觉 QA；
- 更新 README、项目结构导航、工程变更日志和阶段收口记录。

完成标志：自动化和视觉验收均有可复跑证据。

## 9. 验收标准

### 9.1 产品验收

- 一级导航只有资料、知识、训练、学习档案四个工作域；
- AI、RAG、题库、任务和复盘不作为独立一级模块；
- 知识和训练页面使用真实后端数据；
- 04 学习档案不显示虚假掌握度；
- 资料、知识、目标、题目之间可以双向回链；
- 用户可以集中完成知识和题目的审核闭环。

### 9.2 后端验收

- 概览和列表查询不产生写入；
- local-json/PostgreSQL 查询 DTO 一致；
- 组合筛选、分页和排序有自动化测试；
- 列表关联摘要不存在逐项 N+1；
- 现有创建、状态动作和 response envelope 不被破坏。

### 9.3 前端验收

- 资料索引和编辑器无功能回归；
- 工作域切换不会丢失未保存资料草稿；
- 列表筛选、选择和详情状态按工作域隔离；
- 保存失败不清空表单、不伪造成功；
- 右侧栏不再渲染跨资料的完整目标/题目编辑器；
- 三栏独立滚动、窄桌面无横向溢出、键盘焦点可见。

## 10. 风险与控制

### 10.1 未固化工作区

当前 Phase2/3 仍存在大量未提交改动。Phase3.1 必须先完成 P3.1-00，避免把领域收口和前端重构混在同一个不可审查差异中。

### 10.2 全局 state 继续膨胀

使用工作域命名空间、纯状态 helper 和独立 controller；不把所有筛选、选择和加载状态继续平铺到根 state。

### 10.3 查询接口临时扩张

先冻结 DTO 和筛选契约，再实现页面；不允许 Web 为了拼概览逐项请求详情。

### 10.4 右栏迁移引发回归

先新增独立工作台，再将右栏切换为摘要与跳转；迁移期间保持同一 application service 和 API 语义，不复制第二套写入逻辑。

### 10.5 学习档案空壳

04 只冻结位置和依赖说明。没有 `LearningEvidence` 与 `MasteryState` 时不展示演示数字、静态图表或前端推导掌握度。

## 11. 回滚边界

- 本阶段不新增数据库表，不需要数据回滚；
- 新增查询接口可以通过路由装配开关关闭；
- 前端工作域切换必须保留回到现有资料索引的安全路径；
- KnowledgeItem、LearningObjective、Question 等正式数据继续由原应用服务写入；
- 若新工作台验收失败，可以关闭知识/训练入口，资料编辑和右栏候选创建仍保持可用。

## 12. 阶段完成后的下一步

Phase3.1 完成后，再进入正式训练执行领域：

```text
ExamBlueprint
→ Exam
→ ExamQuestionSnapshot
→ Attempt
→ Response
```

随后再进入：

```text
GradeResult
→ LearningEvidence
→ MasteryState
→ ReviewSchedule
```

是否将正式训练执行和批改掌握拆成 Phase4A/Phase4B，应在 Phase3.1 的真实使用反馈和题目资产规模出现后评审，不在本阶段提前扩大范围。

## 13. Phase3.1 实施收口记录

### 13.1 已完成交付

- 后端新增 `workspace-query-utils.js`、`workspace-query-snapshot.js`、`workspace-query-dto.js`、`knowledge-workspace-query-service.js`、`training-workspace-query-service.js`、`review-queue-query-service.js` 和 `workspace-query-service.js`；通过一次批量快照读取组织知识、目标、题目、来源和考试场景摘要。
- 新增 `GET /api/knowledge/overview`、`GET /api/knowledge/training-overview`、`GET /api/knowledge/review-queue`；现有 `items`、`learning-objectives`、`questions`、`exam-profiles` 列表通过 `view=workspace` 返回 `{ items, pagination }` 查询 DTO，旧列表默认数组语义保持不变。
- 前端 Rail 已收敛为 `materials / knowledge / training / learning` 四个工作域；知识工作域包含概览、知识单元、学习目标和审核队列，训练工作域包含概览、题目库、题目编辑和考试场景，学习档案只显示真实依赖门禁。
- 题目工作台支持多个 confirmed LearningObjective、主目标排序信息和 QuestionSource 增删改；ExamProfile/ExamFocus 支持工作台维护，ExamFocus 只能绑定已确认目标。
- 资料右侧栏已收缩为当前资料上下文：标注、NoteVersion、知识单元状态/来源摘要、目标和题目关系回链；完整资产编辑器只存在于知识/训练工作域。
- 新增独立工作域样式和三栏独立滚动布局，使用现有 Swiss Editorial Grid 变量，已覆盖 1280px/1440px 桌面布局约束和窄屏检查器收起策略。

### 13.2 验收证据

- API：`npm run test:api`，`173/173` 通过。
- Web：`npm run test:web`，`131/131` 通过。
- 新增查询测试覆盖：稳定排序、cursor 分页、KnowledgeItem/Objective/Question 关系摘要、概览覆盖率、来源失效审核队列和 `hasQuestions` 筛选。
- 新增 Web 测试覆盖：四工作域 state、工作域渲染、知识/训练编辑器 hook、题目来源和多目标绑定、资料右侧栏只读边界、查询 API 路径与编码。
- 现有资料编辑器、附件、标注、搜索、回收站、导入导出测试保持通过；未新增正式训练执行表或学习档案数据。

### 13.3 有意保留的边界

- 本阶段不新增 `Exam`、`Attempt`、`Response`、`GradeResult`、`LearningEvidence`、`MasteryState` 或 AI/RAG/图谱实体；学习档案入口继续不可进入。
- 查询工作台当前通过批量快照读取全量工作域集合，再在 application read service 中完成组合筛选；后续数据规模显著增长时再引入面向列表的数据库投影或缓存，不在本阶段引入第二套写入模型。
- 生产 PostgreSQL 切换、登录、多用户权限和部署架构不在 Phase3.1 验收范围；local-json/PostgreSQL 的查询 DTO 装配保持同一语义，需在生产切换前继续做真实数据对照演练。

### 13.4 Phase3.1.1 布局修复记录（2026-07-30）

- 修复切换到知识、训练或学习档案后隐藏整个 `knowra-rail` 的问题；全局工作域 Rail 和返回资料入口现在持续可用。
- 修复外层 Grid 仍保留 260px 第一列、但主工作区被放入该列造成内容截断的问题；非资料工作域保持 Rail 可见，主区占满剩余空间。
- 新增 `shell-controller` 回归测试，并在本地浏览器验证知识概览/列表/检查器、训练概览/题目库/编辑入口、学习档案门禁和资料返回路径。
- 该修复按 PATCH 规则发布为 `2.11.1`，不改变领域、API 或数据库结构。
