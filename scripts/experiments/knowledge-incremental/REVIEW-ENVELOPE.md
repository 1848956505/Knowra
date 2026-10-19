# 本地增量报告审阅草稿 v1

本批提供纯契约与离线转换器，不接入 UI、知识库、API、模型调用或 schema 迁移。原实验结果、提示词、评分与 gold 保持冻结。

## 离线使用

在仓库根目录运行：

```sh
node scripts/experiments/knowledge-incremental/export-review.mjs --input /private/result.json --output /private/new-review.json --report-id unique-report-id
```

输入必须是当前增量实验的 `snapshot + rows` 报告，每行必须具有完整 `provider` wrapper。缺失或未知格式报错，不猜测兼容，不删除字段以通过。仅支持 `retrieval` / `oracle`；不会自动读取其他文件、续跑模型或重试网络。

输出必须是尚不存在的新文件，以 `wx` 创建；在支持 POSIX 权限的平台使用 0600。原始输入只读。同路径、已有输出、超限、解析失败或关联不一致均拒绝。失败时可能留有本次新建的不完整输出，请检查后使用新的输出路径；不会覆盖原结果。CLI 只打印计数和字节数，错误不打印正文或供应商消息。

## 共享模块

`@study-accelerator/shared/incremental-review` 是源码 ESM 加 `.d.ts`，沿用现有 shared 模式，无新增编译步骤。共享模块不依赖 Node、DOM、React、文件系统、HTTP 或实验审查门；只有离线适配器调用 Node 实验代码。

- `parseReviewEnvelope(text)` / `validateReviewEnvelope(value)`：严格验证后返回独立副本。
- `decideReview(envelope, session, proposalId, decision)`：`existing`、`new` 或 `defer`；已有选择不覆盖，须先撤销。
- `undoReview(...)`：删除单项选择。
- `createReviewDraft(...)` / `serializeReviewDraft(...)`：导出完整输入及逐项审阅草稿。
- `holdReasons(proposal)`：只用于已验证提案的展示；决定和导出入口仍会完整重验。
- `REVIEW_LIMITS`：文件 UTF-8 字节上限及各字段/集合限制。

合成可导入样例：`packages/shared/test/fixtures/incremental-review.json`。类型定义：`packages/shared/src/incremental-review.d.ts`。

## Envelope 与身份

顶层固定 `kind=knowra.incremental-review`、`version=1`、`approval=not-granted`、`semanticSafety=not-verified`，其余为 `reportId`、`snapshotRef`、`rows`。

行保留笔记、候选概念/条目、完整 provider wrapper、响应状态、未核实解释和提案。提案保留原始输出、验证结果和风险依赖。`providerResult` 与被拒绝的原始提案为有界 JSON 证据载荷，不渲染为 HTML 或执行代码；其他 envelope 字段使用严格键集合。

`rowId = arm:noteId`，`proposalId = reportId/rowId#originalIndex`；不会使用过滤后预览 ID。提供者需给不同报告分配不同 reportId；它和 snapshotRef 都是来源标签/内部一致性线索，不是签名或文件真实性证明。UI 在每次成功导入/重置时必须清空旧 session，不能因为 reportId 相同就恢复选择。

`responseState` 明确区分 `proposals`、`no_proposals`、`invalid_response`、`provider_failure`。空 links 的解释仍是模型未核实解释，`nativeAbstain=false`。无效响应的原始 provider 数据仍保留，不伪装成正常空提案。

## 审阅与信任边界

- `sourceIssue` 警告、同名新概念风险依赖、验证失败项与 `itemAction=reuse` 仅允许待定；直接调用纯函数或伪造 session 也不能绕过此限制。
- reuse 原始语义完整保留，包括 existingItemId；本批不会把它变成新增条目，也不会向旧条目增加来源。
- 新概念风险依赖由共享纯函数重新推导，允许风险项引用自身；不是任意依赖图。导入侧比旧实验审查门更保守：被拒绝的同名新概念也阻断相关项，不能通过伪造 accepted=false 解除风险；无法识别名称的被拒新概念保守阻断本行所有新概念。原实验 gate/gold 不变。
- 无警告不代表安全，结构合法不代表语义或事实正确，引用原文不代表原文可信。文件可被外部编辑，内部一致性检查不能识别所有协调篡改，更不是鉴真服务。
- `existing` 目标须在本行候选内；`new` 名称与语境必填；语境不明可待定。选择只记录意图，不产生正式概念/条目。
- 草稿包括完整报告、每项未决定/待定/选择和风险原因。未完成也能导出，计数明确；不得把草稿视为提交授权、事实核实或已掌握。
- 草稿使用不同 kind，不能作为候选报告重新导入；本批不提供草稿恢复、自动提交、数据库或图投影。
- 原文、警告、模型输出不截断、不清洗、不混入正式陈述。验证失败整体拒绝，不局部跳过。错误不回显正文。

## 上限与 UI 后续约束

输入源报告与 envelope 均限制 1 MiB；适配器先检查文件大小，再进行有界读取。浏览器须在 File.text 前检查 File.size，纯解析器仍会二次检查 UTF-8 大小。最多100行、全报告200提案；每行200概念、1000条目；另有限制 JSON 深度24与节点50000。名称80、语境240、标题160、提案陈述1200、sourceIssue 200、普通展示文本8192、笔记32768、原始证据字符串65536字符。每行模型 links 最多20。进入实验审查门前，快照概念/条目同样受集合上限及唯一/引用校验，累计模拟预算为 rows × (概念数² + 条目数²) ≤ 2,000,000；另在任何 gate 调用前为整个报告估算最多两次最长公共子串检查，累计 sense字符数 × 相关文本字符数 ≤ 10,000,000，使用全快照条目保守计入，避免仅限制文件大小却长时间计算。具体以命名常量为准；草稿整体同样受1 MiB上限，接近上限时导出可能明确失败，不截断输入。

UI 需处理空候选/零提案，不可使用非空断言；导入成功原子替换，失败/取消保留现有审阅。异步文件读取采用世代标识，防止迟到读取覆盖新文件或关闭状态。下载前提示可能包含笔记正文，不写日志、浏览器持久化或 API。安全渲染文本，不自动展开或执行 provider 载荷。此批未实现这些 UI 流程。

## 验证

```sh
npm run test:shared
node --test scripts/test/knowledge-incremental-envelope.test.js scripts/test/knowledge-incremental-review-gate.test.js
npm run test:scripts
```

集成测试重放冻结的18份合成材料模型输出，逐项核对 provider/原文/候选/提案，验证 I09 风险 reuse 仍只能待定、I04 空提案状态不混淆，以及输入字节哈希不变。所有提交样例均为合成材料；真实用户笔记不得进入仓库、CI、截图或测试日志。
