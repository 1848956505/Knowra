# 增量知识归属：现有检索与 Oracle 候选成对对照

这是研究 harness，不是正式知识库功能。只读代码内的公开合成资料，不读私人笔记或数据库；离线模式不读取环境密钥，不调用整理建议、不写生产 schema。默认运行 **零模型调用**。

## 研究问题与冻结边界

从同一份人工确认状态的**合成快照**开始，添加一篇相关笔记：能否复用正确 Concept；应该新增条目还是仅给同一条目补来源；相关但不同的概念会不会被误并？

- `cases.mjs`：9 篇 agent 编写的合成笔记与显式预期，包含同概念新条目、同条目新来源、相关不同、证据不足以及相互冲突的陈述。这不是用户已经确认的真实知识结构，也不是用户验收过的语义标准。
- `core.mjs`：复用 R2 的原版 `SYSTEM_PROMPT`、`retrieveConcepts`、`modelRequest` 和 `applyResponse`。不改挂靠提示词，不夹入粒度规则。
- `provider.mjs`：固定 DeepSeek 地址的一次一请求适配器，fetch 前持久预留20次硬预算，禁止重定向、无重试、60秒超时。
- `run.mjs`：固定 18 个臂请求、持久预留与逐条检查点、报告输出。默认只生成计划；只有明确的 `--live-model` 才读取指定的 `DEEPSEEK_API_KEY`。真实执行必须另行获得许可。

每个样本两臂拥有完全相同的 note、初始状态、提示词和输出契约。真实检索臂走现有字符检索；Oracle 臂只补齐缺失的预设理想候选，必要时替换末尾非目标候选；目标已召回时原排名不变。每臂独立深拷贝，结果不会污染下一篇或下一臂。臂顺序按样本交替。

Oracle 是理想召回干预，不是更好的检索器；当真实检索不足时两臂候选数可能不同，缺失项补入时排序也可能变化。这些差异明示在报告，单次对照只能指出后续排查方向，不能证明唯一因果。预期和 oracleIds 仅在评估/构造端；模型只收到原版字段的 note、候选概念和条目。

## 运行及验证

仓库根目录：

    node scripts/experiments/knowledge-incremental/run.mjs
    node --test scripts/test/knowledge-incremental.test.js

默认输出在 Git 忽略的 `storage/experiments/knowledge-incremental/offline-plan/`；可用 `--out` 指定另一个报告目录。离线计划里的输出与评分均为空，状态为 `not-run`，不能当作实验成功。

程序化 `runTrial({out, mode, invoke})` 支持专门获准的调用方注入适配器：

- `offline-plan`：无适配器，不调用模型。
- `fixture-contract`：测试 stub，仅验证数据流、安全边界和报告；不代表模型表现。
- `live-model`：必须明确批准后才允许运行。CLI 固定 deepseek-chat/temperature=0/max_tokens=2048，地址不可重定向，不提供私人笔记输入选项。

获准后由执行负责人选定**整晚唯一、持久保留**的预算目录：

    node scripts/experiments/knowledge-incremental/run.mjs --live-model --budget-dir <整晚唯一预算目录> --out <真实结果目录>

本次开发只用 fake fetch 测过此入口，**尚未运行真实模型**。密钥通过已有安全环境提供，不写命令行或报告；脚本不枚举/发现其它密钥。固定18个样本臂请求；供应商 fetch 前另有20次硬上限，网络失败、超时、预留后崩溃也占用预算。默认不重试；所有检查点写入都在调用前。跨重启重建适配器、换结果目录或并发调用均共用同一预算目录，不能多于20次进入 fetch。不得删除/更换预算目录绕过整晚总量授权；此本地计数器无法防止人为另建预算。CLI 没有自动重置入口。

同一结果目录续跑不会再次调用已预留请求。已预留但缺少结果的请求标为中断/进行中，不自动重发。协议或评分代码指纹变化时拒绝复用旧检查点；如需新结果目录，仍必须沿用原预算目录。残余预算不足会保存未取得响应的行，不能补测挑结果。非JSON与截断保留原始输出并标失败；不把失败响应文本或凭据写入日志。

## 确认隔离与验收口径

每份原始输出都只进入 `awaiting-human-review` envelope：保存输入候选、原始响应、逐项拒绝理由、模拟变化 `hypotheticalDiff` 与真实提交差异 `committedDiff`。R2 的内存写入仅发生在副本；已确认快照不变，`committedDiff` 始终为空。没有实现批准写入按钮或生产合并；单元测试验证隔离能力，不证明应用已经具备持久确认流程。

评分按每个样本一次计算，新增条目与复用条目分别判断；多个输出不重复累计成功。`routingPass` 只检查预期目标与动作，`evidenceCoveragePass` 要求引用完整合成句（本套样本每篇仅一句）；`contractPass` 仅表示这些规则通过，`needsHumanSemanticReview` 始终为 true，不代表正文语义已被自动验证。提示词与评分端代码指纹均写入检查点，改实现后不能复用旧评分。`applyResponse.accepted` 不是人工批准；全拒绝、部分接受、完整接受分别报告。旧正文、标题、类型、概念归属、确认状态和版本均保留。仅模拟追加来源时检查来源数量；在同一冻结快照上重放只生成预览，不重复提交。

**现有协议缺口：** R2 只有 `reuse/create`，没有原生 `pending`。证据不足样本的路由契约通过值为 `null`，明确报告协议缺口，不能计入“四类全部通过”。`sourceIssue`/remarks 也不等于可靠拒判。所有输出待人工审核是应用隔离策略，不代表模型主动知道自己不确定。

冲突样本的文本检查只是可观察标记，不能证明所有自然语言陈述都忠实原文；语义仍需人工读原始输出。真实模型结果即使成功，也只能支持该合成样本集的一次观察，不得直接改正式知识模型或宣称私人笔记效果已验证。

I03 的可接受已有归属暂设 PyTorch，或新建独立概念；这是本轮 agent 编写的宽容判据，与原 R04 的 C_BACKPROP 判据不同，尚待人工裁定。该例通过不证明“PyTorch 与 x.grad 是同一概念”。

## 确认前审查门（独立离线层）

`review-gate.mjs` 的 `reviewBeforeConfirmation({snapshot, prepared, providerResult})` 只生成 `needs_review` 隔离结果；所有 `approval` 都是 `not-granted`，`committedDiff` 永远为空，不连接正式知识库，也不证明模型语义正确。

- 保留模型完整输出、候选、原文、逐条原动作、风险和校验原因；`sourceIssue` 只表示 AI 报告的未核实风险，不表示已证实原文错误。
- 有风险提案不进入可审阅的假设预览，因此不能自动成为旧条目的支持来源。若同篇新概念组受到风险影响，相关提案一起隔离并记录 `heldByProposalIndices`，不产生悬空概念引用。
- 未标风险的输出仍需人工审核；预览不是可直接提交的批准结果。过滤会重新分配临时 ID，必须使用原提案 `index` 对应的 `previewIdentity` 关联预览，不能沿用原 validation 的临时 ID。
- 仅完整响应且 requestId/包络匹配时，空 links 被记录为 `no_proposals` 并保留原说明，后续由人检查或澄清；不声称旧协议已有原生 abstain/pending。JSON损坏、截断和服务失败分开记录。
- `scripts/test/fixtures/knowledge-incremental-session-20261019.json` 固定保留已授权真实调用的18个**公开合成**输出和原预期/评分，附run及artifact摘要。测试只离线重放，不再调用API。I03的单条gold与两事实粒度差异保留解释，不改原评分；I04旧协议仍拒绝空links；I09仍保留原冲突误复用失败，新门只阻止其进入来源预览。

一次性实跑分支上的 flash 适配器、费用上限和触发workflow不属于本层变更，未自动带入此框架分支。
