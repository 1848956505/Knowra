# 知境：知识模型第二轮边界压力实验

> 范围：研究性质，使用公开合成笔记 + DeepSeek；**不更新正式知识库、不迁移 schema、不启用无人审核的 AI 自动融合**。

## 本轮沿用的用户方向

- “矩阵加法”和“逐元素乘法”可以作为**独立 Concept（圆点）**，同时它们的“定义”又可以成为概念下的 **KnowledgeItem（方块/详情条目）**。**概念身份与定义类别是两个不同轴，不必二选一。**
- **允许 AI 主动补充知识**，且用户原始笔记来源可以为空：要明确来源模式（如 AI 生成）与审核状态（默认 candidate），不能冒充用户提供了原文引文，更不能因此自动确认客观正确性。
- 用户记录的不正确内容可以保留为 disputed 候选，显式提示矛盾对象，方便学习和纠正；不擅自覆盖用户原话。

上述是方向记录，**不是已定稿的数据库字段或允许 AI 自动确认知识的授权**。

## 为什么做第二轮

上一轮 [PR #160](https://github.com/1848956505/Knowra/pull/160) 的真实 DeepSeek 合成实验中，7/7 的 Concept 身份与 KnowledgeItem 新建/复用决策符合预设，但只包括简单的一概念多条目与重复来源。

第二轮故意提高难度，保留 11 个概念的现有目录和 3 条人工预置的“已确认知识”（只存在内存中），依次考验：

| 用例 | 题目 | 测什么 |
| --- | --- | --- |
| H01 | 矩阵、向量、矩阵乘法共同参与的陈述 | 同一 KnowledgeItem 能否关联三个 Concept ID |
| H02 | 自动微分使用链式法则的旧知识被再次记录 | 跨概念 KnowledgeItem 的复用及来源追加 |
| H03 | 用户错误记录“任意同阶矩阵 AB=BA” | 能否识别与旧命题冲突、保留原话、标为 disputed |
| H04 | 正确表述“AB 不一定等于 BA” | 能否复用已有的正确 KnowledgeItem |
| H05 | 请求 AI 补充矩阵乘法通用计算公式（无笔记） | AI 无笔记来源、空 quote、候选态和公式类型 |
| H06 | 数学“矩阵的秩” | 避免和“张量的阶数”混同 |
| H07 | PyTorch “三阶张量” | 避免混入矩阵秩 |
| H08 | 矩阵加法的定义 | Concept 独立；definition/fact 均可作为内容类型 |
| H09 | 梯度（数学对象）与 x.grad（框架属性） | 一条对比陈述关联两个身份不同的 Concept |
| H10 | 错误的 x.require_grad_(True) 调用 | 保留用户原话，标记与正确 API 的冲突，不静默更正 |

### 评分

所有测试预期放在 scenarios.mjs 的 expected 字段，仅供**事后评分**，发送给模型时剥离。单次处理一条主要知识，模型获取当前来源与已有概念/条目目录（含 ID、义项和确认状态）。

- 以**必需 Concept ID + 预先允许的辅助 ID**检验语义范围，防止漏掉重要概念或胡乱多连；同时单独统计与人工最小集合的严格一致数，不仅比较标题；
- 新条目、旧条目复用的 ID；
- 矛盾目标的 KnowledgeItem ID；
- candidate/disputed 状态；
- 原文引文唯一匹配或 AI 空来源；
- 内容类型允许合理多个答案，如“矩阵加法的定义”可用 definition 或 fact。

**同名标题不是复用的充分证据；完整的 JSON 结构合法不等于含义正确。**

报告中的 accepted 仅意味着“模型候选通过模拟器的结构校验”。它不是用户点击确认，更不是科学事实核验。

## 使用与安全

无 API 的合成回归：

    node --test scripts/test/knowledge-hardcases.test.js

在已配置 DEEPSEEK_API_KEY 的可信环境运行：

    node scripts/experiments/knowledge-hardcases/run.mjs

只解析规则且不外发请求：

    node scripts/experiments/knowledge-hardcases/run.mjs --dry-run

GitHub Actions 工作流 “Knowledge model hardcases (synthetic DeepSeek)” 会在它**首次合入 main 时**自动运行一次；此后仅手动运行。**不监听 PR、其它分支 push 或定时事件。**

- API 密钥读取 Repository Secret DEEPSEEK，仅在 DeepSeek 调用步骤映射为环境变量 DEEPSEEK_API_KEY，不写进 Markdown、数据库或日志；
- 仅向 DeepSeek 发送 scenarios.mjs 中的**十条公开合成场景**，固定模型 deepseek-chat、temperature=0，每次输出上限 1600 tokens；失败不重试；
- --out 只决定实验报告保存位置，**无法指定其他输入笔记**；默认本机目录是 Git 忽略的 storage/experiments/knowledge-hardcases/；
- 只有公开合成内容的报告与结果才会暂存 GitHub Actions Artifact（7 天）；请勿将私人笔记、API Key 或其他个人数据放入该目录；
- 只是一次 10 请求的小样本测试，不能推断真实笔记的泛化能力或实际知识正确率；
- 即使全部通过，也不代表正式知境支持 Concept 持久化、多概念关联、冲突审查和可逆历史变更，这些仍需正式建模与人工审查。

下一轮请先仔细阅读 H03、H05 和 H10 的模型**原始候选与来源 quote**，再考虑如何表达跨概念关系、来源为空、候选错误认识、可评测学习目标。不要直接因评分高而将实验 schema 移植进生产。
