# Phase3.0：学习目标与基础训练题目规划

> 文档状态：Phase3.0 实施闭环记录（2026-07-29 更新）
> 适用范围：`LearningObjective`、可选 `ExamProfile/ExamFocus`、`Question` 的最小基础闭环
> 前置阶段：Phase2.0 知识来源与知识单元基础闭环已完成；生产 PostgreSQL 切换仍属于独立发布任务
> 领域基准：[Knowra 知识与考卷系统领域冻结稿](Knowra%20知识与考卷系统领域冻结稿.md)

> 本文是实施边界和验收设计，不是对领域冻结稿的替代。若实现过程中发现需要改变实体语义、关系方向、状态机或正式考试不变性，必须先更新冻结稿并重新评审。

## 1. 阶段定位

Phase2.0 已经建立了：

```text
Note
  ↓
NoteVersion
  ↓
KnowledgeEvidence
  ↓
KnowledgeItem（candidate → confirmed）
```

Phase3.0 在此基础上补齐冻结稿规定的下一段正式知识链路：

```text
KnowledgeItem
  ↓
LearningObjective
  ↓（可选的考试语境）
ExamProfile → ExamFocus
  ↓
Question
```

本阶段的产物是“可评测学习目标 + 有来源、可审阅、绑定目标的基础题目”。它允许用户创建、编辑、审核和预览题目，但不实现正式试卷、答题记录、自动批改或掌握度计算。

## 2. 设计依据与不可突破的原则

以下规则直接来自领域冻结稿，Phase3.0 不得通过实现便利进行弱化：

1. `KnowledgeItem` 与 `LearningObjective` 是两个不同实体；一个知识单元可以有多个学习目标，不能把知识点标题直接当作学习目标。
2. `LearningObjective` 必须描述可观察、可评测的能力，并包含可执行的动作；“了解 TCP”“熟悉 Prim”“掌握流水线”不能直接作为已确认目标。
3. 未确认的 `LearningObjective` 不得进入正式题目绑定或正式出题范围。
4. `ExamFocus` 是具体考试或训练场景下对学习目标的强调，不是新的知识点；没有具体考试语境时可以不创建它。
5. 一个 `Question` 至少绑定一个 `LearningObjective`，一个学习目标可以绑定多个题目；关系必须通过显式中间实体保存。
6. 正式题目必须具备参考答案或评分量规；本阶段的题目即使还没有进入正式试卷，也不得保存为“没有可核对答案”的正式资产。
7. `QuestionSource` 保存题目的原始依据，不能只保存“AI 生成”或“人工创建”这一枚举。
8. 本阶段继续保持模块化单体、local-json 默认驱动和 PostgreSQL opt-in；不引入微服务、消息队列或新的前端框架。
9. AI、RAG、文件读取和网络调用不得放入数据库事务；本阶段不接入外部 AI，只预留来源与异步作业边界。
10. 所有新接口继续使用 `{ data }` / `{ error }` 响应信封，并由 application service 负责领域校验。

## 3. 阶段目标与完成定义

### 3.1 目标

完成以下最小可用闭环：

1. 从已确认的 `KnowledgeItem` 创建 `LearningObjective` 候选；
2. 编辑目标文本、动作词、认知层级和难度提示；
3. 通过规则校验后将目标确认，或标记为需修订/归档；
4. 在需要时创建人工维护的 `ExamProfile` 和 `ExamFocus`；
5. 创建题目草稿，并明确题型、题干、选项/答案结构、解析和来源；
6. 将题目绑定至少一个已确认的 `LearningObjective`，支持多目标题；
7. 校验通过后将题目置为 candidate/confirmed，并在知识侧预览关联目标、来源和审核状态；
8. local-json 与 PostgreSQL 两条驱动提供一致的领域语义，并能从迁移报告、快照和回滚中恢复。

### 3.2 完成定义

Phase3.0 只有在目标、题目、来源、审核门禁、双驱动、API、前端最小交互和回归测试全部通过后，才能标记为完成。仅有 Prisma 表或仅有题目录入页面不算闭环。

## 4. 阶段边界

### 4.1 本阶段纳入

| 范围 | 说明 |
| --- | --- |
| LearningObjective | 完整的候选、确认、需修订、归档基础状态流转；必须关联 KnowledgeItem |
| ExamProfile | 最小人工维护的考试/训练场景描述；用于给 ExamFocus 提供上下文，不做复杂考试配置 |
| ExamFocus | 可选的学习目标侧重点；支持人工创建和审核，不实现历年试卷自动分析 |
| Question | 最小题目资产：题型、题干、选项/答案、解析、难度、审核状态、版本字段 |
| QuestionObjective | Question 与 LearningObjective 的显式多对多关系 |
| QuestionSource | 题目原始依据和来源定位；支持手工、笔记版本、知识证据等来源 |
| 预览与审核 | 知识详情、目标列表、题目编辑/预览和基础审核动作 |
| 双持久化 | JSON schema 增量升级、local-json Repository、Prisma schema/migration、PostgreSQL Repository |
| 迁移与快照 | 新集合的兼容读取、导入导出、只读预检和可回滚转换 |

### 4.2 明确排除

以下内容不属于 Phase3.0，不能为了“顺手”写入本阶段：

- `ExamBlueprint`、正式 `Exam`、正式试卷组卷和不可变试卷快照；
- `Attempt`、`Response`、答题提交、考试计时和训练会话；
- `GradeResult`、自动批改、评分模型和低置信度人工复核工作流；
- `LearningEvidence`、`MasteryState`、遗忘曲线和自适应推荐；
- AI 生成题目、AI 提取目标、Embedding、RAG、图谱检索和外部模型调用；
- 历年真题批量解析、自动生成 ExamFocus、复杂题库去重和题目质量排名；
- 复杂题型编辑器、公式/代码判题、文件题、音视频题和富媒体题干；
- 多用户权限、协作审核、组织/班级和用户级题库隔离；
- 改写历史 NoteVersion、自动补造历史 LearningObjective 或从旧笔记推断正式题目；
- 把当前未恢复的历史附件重新归入本阶段迁移；第 6 个附件的放弃结论保持不变。

## 5. 领域对象设计

### 5.1 LearningObjective

`LearningObjective` 表示“学完后能够完成什么可观察动作”，不是知识主题、笔记摘要或考试题目。

建议字段：

| 字段 | 类型/取值 | 规则 |
| --- | --- | --- |
| `id` | string | 稳定 ID，不因编辑目标文本而变化 |
| `knowledgeItemId` | string | 必填，指向一个未归档的 KnowledgeItem |
| `objective` | string | 可评测目标陈述，必填 |
| `actionVerb` | enum/string | 如 `identify`、`explain`、`apply`、`compare`、`analyze`；首版限制为受控集合 |
| `cognitiveLevel` | enum | `remember`、`understand`、`apply`、`analyze` |
| `difficultyHint` | enum/string/null | `easy`、`medium`、`hard` 或未设置；仅为提示，不等同评分难度 |
| `reviewStatus` | enum | `candidate`、`confirmed`、`archived`；需修订通过单独动作或 `reviewNote` 表达 |
| `reviewNote` | string/null | 审核意见，不能替代状态机 |
| `order` | integer | 同一 KnowledgeItem 下的展示顺序 |
| `createdAt`/`updatedAt` | datetime | 服务端生成 |

确认门禁至少包括：

- `knowledgeItemId` 存在、同一空间且 KnowledgeItem 未归档；
- `objective` 非空，长度和控制字符符合输入约束；
- 存在受控 `actionVerb`，且目标文本不能只有“了解/熟悉/掌握”等不可验证表达；
- `cognitiveLevel` 与 `actionVerb` 不发生明显冲突；
- 候选状态可保存不完整草稿，但正式绑定题目前必须是 `confirmed`。

本阶段不强制把目标拆成“条件、行为、标准”三列，也不实现自动语言学判断；规则校验失败时返回可解释错误码，人工审核仍是最终确认手段。

### 5.2 ExamProfile（可选上下文）

`ExamProfile` 表示考试、课程测验或训练场景的稳定上下文。它不是正式试卷实例。

建议字段：

| 字段 | 类型/取值 | 规则 |
| --- | --- | --- |
| `id` | string | 稳定 ID |
| `name` | string | 场景名称，必填 |
| `description` | string/null | 场景说明 |
| `scope` | JSON/string[] | 知识范围引用；首版只保存显式 KnowledgeItem/Folder 引用，不自动推断 |
| `language` | string | 默认 `zh-CN` |
| `commonQuestionTypes` | JSON/string[] | 人工偏好，不能代替题目实际题型 |
| `difficultyProfile` | JSON/object | 人工维护的难度提示，不参与本阶段自动组卷 |
| `createdAt`/`updatedAt` | datetime | 服务端生成 |

本阶段只提供最小 CRUD 和引用校验。删除 Profile 不得删除 LearningObjective、ExamFocus 或 Question；若存在焦点引用，应采用归档/解除引用策略。

### 5.3 ExamFocus（可选）

`ExamFocus` 表示某个 `ExamProfile` 对某个 `LearningObjective` 的额外强调。

建议字段：

| 字段 | 类型/取值 | 规则 |
| --- | --- | --- |
| `id` | string | 稳定 ID |
| `examProfileId` | string | 必填 |
| `learningObjectiveId` | string | 必填，必须指向已确认目标 |
| `description` | string | 场景化侧重点 |
| `priority` | integer | 数值越小/越大采用哪种排序必须在 API 契约中固定；建议 1 为最高优先级 |
| `difficultyHint` | enum/string/null | 场景下的难度提示 |
| `questionTypeSuggestions` | JSON/string[] | 建议题型，不自动生成题目 |
| `sourceType` | enum | `manual`、`ai`、`pastPaper`、`syllabus`；本阶段实际写入只开放 `manual` |
| `reviewStatus` | enum | `candidate`、`confirmed`、`archived` |
| `createdAt`/`updatedAt` | datetime | 服务端生成 |

约束：

- `ExamFocus` 不拥有 KnowledgeItem，不能复制或覆盖目标正文；
- 没有具体 ExamProfile 时，题目可以直接绑定 LearningObjective；
- 只有 `confirmed` 的 ExamFocus 才能作为正式题目筛选条件；
- AI、历年试卷和 syllabus 来源先保留枚举兼容性，但本阶段不得伪造这些来源。

### 5.4 Question

`Question` 是可审阅的题目资产。题目评估一个或多个学习目标，不直接评估 Note 或 Annotation。

建议字段：

| 字段 | 类型/取值 | 规则 |
| --- | --- | --- |
| `id` | string | 稳定题目身份 |
| `questionType` | enum | 首版建议只支持 `singleChoice`、`multipleChoice`、`shortAnswer`、`trueFalse` |
| `stem` | string/JSON | 题干；首版以纯文本或受限 Markdown 为主 |
| `options` | JSON/null | 选择题选项；非选择题为空 |
| `referenceAnswer` | string/JSON/null | 参考答案；正式题目必填其一 |
| `rubric` | JSON/null | 评分量规；首版可为结构化简单标准 |
| `explanation` | string/null | 解析/反馈 |
| `difficulty` | enum/string/null | `easy`、`medium`、`hard` 或未设置 |
| `reviewStatus` | enum | `draft`、`validating`、`candidate`、`confirmed`、`archived` |
| `sourceMode` | enum | `manual`；为后续 AI/导入保留扩展位，但本阶段不实现外部来源 |
| `version` | integer | 题目编辑版本；不等同正式试卷快照 |
| `createdAt`/`updatedAt` | datetime | 服务端生成 |

题型语义首版建议：

- `singleChoice`：至少两个选项，只有一个正确选项，参考答案保存选项 ID；
- `multipleChoice`：至少两个选项，至少一个正确选项，参考答案保存选项 ID 集合；
- `trueFalse`：固定真假选项，参考答案为布尔值；
- `shortAnswer`：参考答案必填，允许附带简单 rubric；
- 题型校验只保证数据结构和基本答案存在，不在本阶段做自动评分。

### 5.5 QuestionObjective

采用显式中间实体保存多对多关系：

```text
Question
  └─ QuestionObjective ─┐
                         └─ LearningObjective
```

建议字段：`questionId`、`learningObjectiveId`、`isPrimary`、`order`、`createdAt`。

规则：

- 同一题目与目标组合唯一；
- 至少一个目标，最多数量由应用层设置合理上限；
- 至少一个目标必须为 `confirmed`，正式 `candidate/confirmed` 题目不接受仅绑定 candidate 目标；
- `isPrimary` 最多一个，题目至少有一个主目标时才提供该字段；
- 删除目标不级联删除历史题目，优先阻止删除并要求归档/解除绑定。

### 5.6 QuestionSource

题目来源是可审计数据，不是单一标签。建议字段：

| 字段 | 类型/取值 | 规则 |
| --- | --- | --- |
| `id` | string | 稳定 ID |
| `questionId` | string | 必填 |
| `sourceType` | enum | `knowledgeItem`、`learningObjective`、`noteVersion`、`knowledgeEvidence`、`manual`、`pastPaper`、`ai` |
| `sourceId` | string/null | 可回链实体 ID；manual 可为空但必须有声明 |
| `quote` | string/null | 来源摘录，不能替代实体回链 |
| `locator` | JSON/null | NoteVersion/Annotation 的定位信息 |
| `contentHash` | string/null | 来源内容哈希，用于后续失效检测 |
| `status` | enum | `valid`、`stale`、`invalid` |
| `createdAt`/`updatedAt` | datetime | 服务端生成 |

本阶段至少要求一个 QuestionSource。来源失效时，题目不自动删除；正式确认动作应重新检查来源状态并给出需复核结果。

## 6. 状态机与领域门禁

### 6.1 LearningObjective

```text
candidate ──确认──> confirmed ──归档──> archived
    │                    │
    └──需修订/编辑────────┘
```

- candidate 可以是用户草稿或未来 AI 草稿；
- confirmed 才能被正式题目绑定；
- archived 只读，不接受新的正式题目绑定；
- “需修订”不额外发明与冻结稿冲突的状态，使用编辑动作、`reviewNote` 和回到 candidate 表达。

### 6.2 Question

```text
draft → validating → candidate → confirmed → archived
             │             │
             └──校验失败───┘
```

- `draft` 可保存不完整内容；
- `validating` 是一次校验过程状态，不代表已通过审核；
- candidate 必须拥有题干、题型有效结构、至少一个 confirmed LearningObjective 和至少一个有效来源；
- confirmed 还必须拥有 `referenceAnswer` 或 `rubric`；
- archived 题目不删除已存在的来源和关系，后续正式试卷阶段也不得改写历史快照；
- 本阶段不允许从 confirmed 直接覆盖式编辑；编辑应生成递增 `version`，并由应用服务明确决定是否回到 candidate。

### 6.3 跨实体校验

确认或正式绑定前按以下顺序检查：

1. 所有 ID 存在且属于当前单用户空间；
2. KnowledgeItem、LearningObjective、ExamProfile/ExamFocus 的状态允许当前动作；
3. 目标与题目之间的关系不重复，且不发生跨空间引用；
4. 题目结构和答案结构通过题型校验；
5. 来源实体存在且未失效；
6. 业务规则全部通过后才提交持久化变更。

校验失败必须返回稳定错误码和字段级信息。不能先写入半套关系、再靠启动扫描修复。

## 7. 持久化与 Prisma Schema 设计

### 7.1 JSON schema

建议从当前 Phase2.0 schema 版本增量升级到 `schemaVersion: 3`，新增集合：

```json
{
  "learningObjectives": [],
  "examProfiles": [],
  "examFocuses": [],
  "questions": [],
  "questionObjectives": [],
  "questionSources": []
}
```

迁移要求：

- 旧 JSON 读取时为缺失集合提供空数组；
- 不从旧 Note、Annotation 或 KnowledgePoint 自动推断目标和题目；
- 导入时验证实体引用、状态和题型结构；
- 导入失败保留原文件，使用同目录临时文件和原子替换；
- 导出快照必须携带 schemaVersion 和完整新集合，回滚可使用迁移前快照；
- 新集合只在新功能显式使用时写入，现有笔记保存不得产生空业务记录。

### 7.2 PostgreSQL

建议新增一组 additive migration，例如 `3_learning_objective_question_domain`，至少包含：

- `LearningObjective`；
- `ExamProfile`；
- `ExamFocus`；
- `Question`；
- `QuestionObjective`；
- `QuestionSource`。

建议索引与约束：

- `LearningObjective.knowledgeItemId + order`；
- `LearningObjective.reviewStatus`；
- `ExamFocus.examProfileId + learningObjectiveId` 唯一约束；
- `Question.reviewStatus + updatedAt`；
- `QuestionObjective.questionId + learningObjectiveId` 唯一约束；
- `QuestionSource.questionId + sourceType + sourceId` 的合理唯一约束，manual 来源需允许稳定声明 ID；
- 外键默认 `RESTRICT` 或应用层保护，不对正式知识/题目使用无条件级联删除。

题干选项、rubric、difficultyProfile 等暂不稳定或题型相关结构可以使用 Prisma `Json`，但必须由 application/domain 层做结构校验，不能把 JSON 当作无约束垃圾桶。

### 7.3 事务边界

同一驱动内，下列关系变更应在一个数据库/JSON 原子提交边界内完成：

- 创建或更新目标及其排序；
- 创建题目、题目目标关系和题目来源；
- 题目状态确认及确认门禁；
- ExamFocus 与目标/Profile 的关联。

校验、文件读取、未来 AI 调用和外部网络请求必须在事务外完成；本阶段没有外部 AI 调用。

## 8. Repository 与 Application 方案

### 8.1 Repository 边界

每个实体提供 local-json 和 PostgreSQL 两套实现，接口以领域对象和 DTO 为边界，不泄露 Prisma client、JSON 内部数组或 HTTP request。

建议最小能力：

| Repository | 最小查询/写入能力 |
| --- | --- |
| `LearningObjectiveRepository` | 按 ID、KnowledgeItem、状态查询；创建、更新、状态变更、排序 |
| `ExamProfileRepository` | 列表、详情、创建、更新、归档 |
| `ExamFocusRepository` | 按 Profile/目标查询；创建、更新、确认、归档 |
| `QuestionRepository` | 按 ID、状态、目标、Profile/Focus 查询；创建草稿、更新版本、状态变更 |
| `QuestionObjectiveRepository` | 替换题目目标关系、批量读取目标摘要、唯一性校验 |
| `QuestionSourceRepository` | 创建/读取来源、状态更新、按实体回链查询 |

查询关联数据时使用批量读取或 join/include，避免题目列表逐题查询目标和来源的 N+1。Repository 返回稳定领域 DTO，不能把 Prisma `Decimal`、Date 或内部枚举直接泄露给 Web。

### 8.2 Application Service

建议拆分：

- `learning-objective-service`：创建、编辑、确认、需修订、归档、恢复；
- `exam-profile-service`：最小 Profile 管理和范围引用校验；
- `exam-focus-service`：Focus 管理和目标/Profile 关系校验；
- `question-service`：题目草稿、题目版本、题型校验、状态动作；
- `question-source-service` 或由 `question-service` 编排：来源创建、失效检查和回链 DTO；
- `question-validation`：纯函数题型与答案结构校验，供两个驱动和测试复用。

Application service 负责：

1. 解析 DTO、生成 ID 和服务端时间；
2. 检查单用户/空间边界；
3. 编排多个 Repository；
4. 在确认前运行完整门禁；
5. 返回适合 HTTP/UI 的 DTO；
6. 将异常转换为稳定 AppError，不吞掉基础设施错误。

## 9. HTTP 契约建议

继续采用手写路径匹配和 `{ data }` / `{ error }` 信封。最终路径以现有路由风格为准，建议如下：

### 9.1 LearningObjective

- `GET /api/knowledge-items/:knowledgeItemId/learning-objectives`
- `POST /api/knowledge-items/:knowledgeItemId/learning-objectives`
- `GET /api/learning-objectives/:id`
- `PATCH /api/learning-objectives/:id`
- `POST /api/learning-objectives/:id/confirm`
- `POST /api/learning-objectives/:id/request-revision`
- `POST /api/learning-objectives/:id/archive`
- `POST /api/learning-objectives/:id/restore`

### 9.2 ExamProfile/ExamFocus

- `GET/POST /api/exam-profiles`
- `GET/PATCH /api/exam-profiles/:id`
- `POST /api/exam-profiles/:id/archive`
- `GET/POST /api/exam-profiles/:id/focuses`
- `PATCH /api/exam-focuses/:id`
- `POST /api/exam-focuses/:id/confirm`
- `POST /api/exam-focuses/:id/archive`

### 9.3 Question

- `GET /api/questions?status=&learningObjectiveId=&examFocusId=`
- `POST /api/questions`
- `GET /api/questions/:id`
- `PATCH /api/questions/:id`
- `POST /api/questions/:id/validate`
- `POST /api/questions/:id/submit-review`
- `POST /api/questions/:id/confirm`
- `POST /api/questions/:id/archive`
- `POST /api/questions/:id/restore`

接口要求：

- `POST /api/questions` 默认只能创建 draft；不能通过请求体直接伪造 confirmed；
- 更新题目目标关系时使用整体替换或明确的批量操作，避免半套关系；
- 题目详情返回目标摘要和来源摘要，但不返回底层数据库对象；
- 列表接口返回稳定排序和分页参数，首版至少支持 `limit`/`cursor` 或明确上限；
- 失败响应必须区分 `INVALID_OBJECTIVE`、`OBJECTIVE_NOT_CONFIRMED`、`QUESTION_INVALID_STRUCTURE`、`QUESTION_SOURCE_INVALID`、`QUESTION_CONFIRMATION_REQUIRED` 等错误类型。

## 10. 前端最小交互边界

继续沿用当前 Vanilla JS 模块化工作台：

1. 在 KnowledgeItem 详情/右侧来源面板增加“学习目标”列表；
2. 支持创建目标草稿、编辑、确认、需修订和归档，清晰显示目标状态和关联 KnowledgeItem；
3. 增加“基础题目”入口，可以从已确认目标创建题目草稿；
4. 提供题型、题干、选项/参考答案、解析、难度、来源和目标绑定的最小编辑表单；
5. 题目确认前展示门禁错误；确认后展示题目状态、目标回链和来源状态；
6. ExamProfile/ExamFocus 的领域与 API 已实现；本次前端暂不提供独立管理入口，避免在知识库主导航中提前引入复杂题库模块；
7. 题目页面只做资产管理和预览，不显示不存在的“开始考试”“自动批改”“掌握度”按钮；
8. 保存失败时不清空编辑器、不伪造本地成功状态，沿用当前请求序列和错误提示机制。

## 11. 数据迁移、快照与回滚

### 11.1 历史数据策略

当前 Phase2.0 严格预检中 `knowledgeItems`、`knowledgeEvidence` 均为 `0`，且历史 JSON 没有可靠的学习目标/试题来源，因此：

- 不从 Note 标题、Annotation、旧 KnowledgePoint 或标签自动生成正式 LearningObjective；
- 不从笔记正文自动生成 Question；
- 新集合以空数组进入 schema v3，所有新记录从 Phase3.0 功能入口产生；
- 如果未来迁移前已有候选数据，必须通过显式版本化转换并将不确定项列为 warning，不能静默“猜测绑定”。

### 11.2 迁移工具

沿用 `scripts/migrate-json-to-postgres.mjs` 的只读预检和显式 `--apply`：

- 扩展报告计数：objectives、profiles、focuses、questions、questionObjectives、questionSources；
- 校验目标、题目、来源的跨实体引用和状态门禁；
- 校验题型结构、参考答案/rubric 和唯一关系；
- 迁移失败不写入部分正式数据；
- `--apply` 前必须有 JSON 快照、数据库目标为空检查和回滚说明；
- 迁移报告必须记录人工来源、无来源草稿和失效来源，不把 warning 降级为 success。

### 11.3 回滚

- JSON：保留迁移前快照，用原子替换恢复；新集合只在快照提交后写入；
- PostgreSQL：使用 additive migration 的 down/recovery 方案或恢复到迁移前备份，不在业务代码中执行危险级联删除；
- 应用：新 API 通过显式 feature flag 或路由装配开关控制，关闭 Phase3.0 不影响 Note、Annotation、KnowledgeItem 现有读取；
- 回滚后必须重新运行 API/Web/脚本回归和附件完整性检查，确认阶段新数据未被误读成旧实体。

## 12. 开发任务拆分

### P3-01：冻结实现契约与题型最小集合

- 对照领域冻结稿确认六个实体的字段、状态、关系和错误码；
- 确定首版题型是否采用 `singleChoice`、`multipleChoice`、`trueFalse`、`shortAnswer`；
- 固化答案、选项、rubric 的 JSON 结构和大小上限；
- 输出 API DTO、状态转移表和迁移报告字段。

**完成标志：**冻结稿无冲突，题型结构有 JSON 示例和非法示例，开发不再临时扩大题型范围。

### P3-02：LearningObjective 领域与双 Repository

- 新增目标 domain factory、状态动作和纯规则校验；
- 实现 local-json Repository 与 schema v3 集合；
- 实现 Prisma model、migration、mapper 和 PostgreSQL Repository；
- 覆盖排序、同空间引用、确认门禁和归档保护。

**完成标志：**两个驱动对目标 CRUD/确认/需修订/归档给出一致结果。

### P3-03：ExamProfile/ExamFocus 最小上下文

- 实现 Profile/Focus domain、Repository、服务和关系校验；
- 仅开放 manual sourceType；
- 确认 Focus 必须绑定 confirmed LearningObjective；
- 禁止删除后留下题目/目标的悬空引用。

**完成标志：**无考试语境时题目可直接绑定 LearningObjective；有语境时可查询 confirmed Focus。

### P3-04：Question 与题型校验

- 实现 Question、QuestionObjective、QuestionSource domain；
- 实现题型结构、答案/rubric、目标状态和来源状态校验；
- 实现题目版本递增和状态动作；
- 保证多目标题、来源失效、目标归档的行为可解释。

**完成标志：**不能创建仅绑定 candidate 目标、无来源或无参考答案/rubric 的可确认题目。

### P3-05：双驱动持久化与迁移

- 扩展 JSON schema、快照导入导出和关系校验；
- 新增 Prisma additive migration；
- 扩展 JSON → PostgreSQL 预检、报告和空目标迁移；
- 完成 local-json/PostgreSQL 快照等价性检查。

**完成标志：**旧 JSON 可读取，新集合可增量写入，迁移 dry-run 不产生隐式业务记录。

### P3-06：Application 与 HTTP

- 建立目标、Profile、Focus、Question service；
- 接入现有 knowledge module 装配和 Postgres async 装配；
- 添加列表、详情、创建、编辑、审核和归档路由；
- 统一错误信封、状态码、分页和字段级错误。

**完成标志：**HTTP 层保持薄，所有跨实体门禁由 application service 统一执行。

### P3-07：Web 最小管理与预览

- 在现有 KnowledgeItem 右侧面板接入目标列表和状态动作；
- 增加基础题目编辑/预览页或面板；
- 接入状态、来源、题目目标和保存失败保护；
- 不新增 React 主路径、正式考试入口或虚假 AI 功能。

**完成标志：**用户可以从 confirmed KnowledgeItem 创建目标，再从 confirmed 目标创建并预览基础题目。

### P3-08：测试、文档与交接

- 领域纯规则测试；
- local-json/PostgreSQL Repository 对照测试；
- HTTP 契约、错误码、分页和状态机测试；
- Web API/UI 回归测试；
- Prisma、迁移、快照、回滚和 `git diff --check` 验证；
- 更新项目结构导航、README、工程变更日志和本规划收口记录。

**完成标志：**本阶段所有验收证据可复跑，且 Phase0/Phase1/Phase2 既有功能不回归。

## 13. 阶段准入条件

开始编码前必须满足：

1. 领域冻结稿仍是唯一当前基准；
2. Phase2.0 代码测试通过，`KnowledgeItem` 和 `KnowledgeEvidence` 双驱动闭环可用；
3. 本地严格迁移预检为 `ready`；第 6 个附件的放弃记录和未迁移事实保持可追溯；
4. 历史 Annotation 的 1 条 unresolved warning 已登记处理负责人和后续复核动作，不得在 Phase3.0 中静默改写；
5. 本地 Docker PostgreSQL 可重复部署现有 migration，且生产数据库不作为开发测试库；
6. 首版题型、答案结构、来源类型和状态错误码完成评审；
7. 明确 Phase3.0 不承担 Attempt/Grade/Mastery/AI，避免任务边界在实现中膨胀。

## 14. 验收标准

### 14.1 领域验收

- LearningObjective 必须关联 KnowledgeItem，且确认前必须通过可评测动作校验；
- candidate LearningObjective 不能被正式 Question 绑定；
- ExamFocus 可选，不能改变 LearningObjective 的正文或拥有 KnowledgeItem；
- Question 至少绑定一个 confirmed LearningObjective 和一个 QuestionSource；
- Question 的题型结构、参考答案或 rubric 均通过校验；
- Question 状态动作符合 `draft → validating → candidate → confirmed → archived`，非法跳转返回稳定错误；
- 来源失效不会自动删除题目，确认动作会阻止或提示复核；
- 删除/归档目标不会破坏历史题目关系，不产生悬空正式引用。

### 14.2 持久化验收

- local-json 与 PostgreSQL 对同一组 fixture 的创建、更新、查询、确认和归档结果一致；
- JSON schema v3 可读取 v2 数据，缺失新集合时默认空数组；
- PostgreSQL additive migration 可重复部署，失败不会留下半套新表数据；
- 导入导出保留题目目标关系、题目来源、状态和版本字段；
- 迁移报告能区分 error、warning、repairable 和 success，不把历史猜测写成正式来源；
- 关闭 Phase3.0 路由后，旧 Note、Annotation、KnowledgeItem API 和附件服务仍可用。

### 14.3 前端与回归验收

- 可从 KnowledgeItem 详情创建并确认 LearningObjective；
- 可从 confirmed LearningObjective 创建、编辑、验证和预览 Question；
- 目标/题目保存失败时编辑内容不被清空，状态不乐观伪造；
- API、Web、脚本、Prisma 和编辑器 bundle 验证通过；
- 现有笔记编辑、保存竞态、附件读取、标签、搜索、回收站、导入导出、NoteVersion 和 KnowledgeEvidence 回归通过。

## 15. 风险与未冻结事项

### 15.1 题型范围

领域冻结稿没有冻结首版题型集合。本规划建议先采用四种基础题型，但在 P3-01 评审前不得把建议当作不可变领域规则。若验证成本过高，可先交付 `singleChoice + shortAnswer`，其余题型延后，不改变 Question 核心关系。

### 15.2 目标自动拆分与 AI 生成

本阶段只做人工创建和人工确认。后续 AI 可以生成 candidate，但必须通过同一 LearningObjective/Question 门禁，且 AI 请求应进入独立 AIJob，不得在数据库事务内调用。

### 15.3 目标和题目的版本关系

本阶段只为 Question 维护编辑 `version`，不实现正式 Paper 快照。若目标正文变化导致题目需要复核，先标记题目需要人工检查，不自动覆盖题目或伪造历史快照。

### 15.4 ExamProfile 的实际使用频率

ExamFocus 在冻结稿中是可选对象。若真实使用尚未出现考试场景，允许先完成实体契约和 Repository，再将 UI/CRUD 延后到同一阶段的后置工作包；不得为了填满模型强制每道题创建 ExamFocus。

### 15.5 当前历史数据清洁度

Phase2.0 的历史迁移只生成 baseline NoteVersion，没有可可靠回填的 LearningObjective 或 Question。Phase3.0 的验收重点是新数据闭环，不以“自动补齐历史知识和题目数量”为指标。

## 16. 下一阶段安排与之后

Phase3.0 完成后，先进入 [Phase3.1 四工作域前端与资产工作台](Phase3.1%20四工作域前端与资产工作台规划.md)，将当前右侧栏最小交互升级为独立的知识与训练资产工作台。Phase3.1 只增强前端信息架构和只读查询能力，不新增正式训练领域对象。

Phase3.1 完成并验证知识、目标和题目资产管理后，再进入训练执行与评价阶段：

```text
Question
  ↓
ExamBlueprint / Exam（保存不可变题目快照）
  ↓
Attempt → Response
  ↓
GradeResult
  ↓
LearningEvidence → MasteryState
```

Phase4.0 的准入评审至少需要重新确认：

- 正式试卷快照如何与题目编辑版本隔离；
- 答题、批改和人工复核的状态机；
- LearningEvidence 如何成为掌握度唯一写入口；
- 自评、AI 批改和人工批改的证据优先级；
- 公式、代码题和复杂评分量规是否单独拆阶段。

本阶段和 Phase3.1 都不提前冻结掌握度公式、遗忘曲线、RAG 参数、图谱布局或 AI 代理策略。

## 17. 规划文档验收记录

- 已对照领域冻结稿确认下一阶段主链路为 `KnowledgeItem → LearningObjective → ExamFocus（可选）→ Question`；
- 已明确不提前纳入 `ExamBlueprint`、`Exam`、`Attempt`、`Response`、`GradeResult`、`LearningEvidence`、`MasteryState`、AI、RAG 和知识图谱；
- 已将第 6 个无法恢复附件的放弃决定作为 Phase2.0 数据处置前提，不在 Phase3.0 重新迁移；
- Phase3.0 已完成最小实现闭环：LearningObjective、ExamProfile/ExamFocus、Question/QuestionObjective/QuestionSource 已接入 local-json 与 PostgreSQL 双驱动；已提供 HTTP API、知识侧右栏最小管理/预览交互和迁移/快照支持。
- 前端已完成最小管理闭环：在 KnowledgeItem 右侧来源/标注面板中展示学习目标；支持目标新增、编辑、确认、归档和恢复；仅允许从 confirmed LearningObjective 创建基础训练题，并支持题型、题干、参考答案、解析的编辑，以及题目校验、确认、归档和恢复。
- 前端当前不是独立题库工作台：ExamProfile/ExamFocus 尚未提供 Web 管理界面；QuestionSource 目前在创建题目时由前端自动生成学习目标来源，尚未提供来源详情编辑/回链管理；后端支持多目标关系，但当前前端入口按主目标提供最小交互。正式试卷、作答、评分、掌握度和 AI/RAG 仍不属于本阶段。
- 关键前端实现位于 `apps/web/src/services/knowledge-api/knowledge-domain-service.js`、`apps/web/src/controllers/assessment-controller.js`、`apps/web/lib/sidebar/annotation-panel.js` 和 `apps/web/lib/events/aside-events/click.js`；API/Repository/领域实现分别位于 `apps/api/src/modules/knowledge/` 下对应的 domain、application、infrastructure 和 http 层，未改变模块化单体边界。
- 验收证据：新增 6 条 Phase3 API/来源失效/迁移/本地持久化测试；完整 `npm test` 在具备本机监听权限的环境中通过（API 171/171、Web 130/130、scripts 8/8）；Prisma schema validate、client generate 和本地 Docker PostgreSQL migration deploy/status 通过，4 个迁移均已应用；PostgreSQL 空库读路径 smoke test 通过，`git diff --check` 通过。
- 本阶段未切换生产 PostgreSQL，未实现正式试卷、答题、批改、掌握度或 AI/RAG；下一阶段应按第 16 节重新评审正式试卷快照与训练执行边界。
- 当前产品信息架构已收敛为资料、知识、训练、学习档案四个一级工作域；Phase3.1 将先完成知识与训练资产工作台，再进入正式试卷、作答和评价领域。
