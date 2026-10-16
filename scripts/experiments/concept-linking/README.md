# 知境：Concept 身份与知识条目复用（独立实验）

> 研究状态：**仅验证 AI 在公开合成笔记中能否建议正确的 Concept ID**。不添加正式 Concept schema，不读写 Knowra 数据库，不接入在线提炼，也不代表已有产品已经具备自动融合能力。

## 这次验证的问题

在第一轮 A/B 中，v2 能把“矩阵乘法的维度条件”重命名为“矩阵乘法”，但这不代表真实组织能力。

本实验刻意把两种身份拆开：

- **Concept ID**：稳定的“矩阵乘法”概念，只存在一个。
- **KnowledgeItem ID**：多个定义、性质、计算方法和 PyTorch 用法各有自己的 ID，并各自保留笔记来源。
- 当另一篇笔记只是重复一个已有规则时，应该**复用旧 KnowledgeItem 并追加来源**，而不是覆盖它或创建同义重复。

模型返回的概念 ID 必须是传入 catalog 的已有 ID；当不存在“矩阵乘法”时，模型只可**提议**新 Concept，服务端内存模拟器才为它分配 ID。名字相同不足以通过测试。

## 七篇合成笔记（人工制定期望，不能发给模型）

| 笔记 | 主要知识 | 期望动作 |
| --- | --- | --- |
| N01 | 矩阵乘法的维度匹配条件 | 原概念库不存在矩阵乘法 → 新建 Concept，建规则条目 |
| N02 | 矩阵乘法一般不满足交换律 | 关联同一 Concept，新建独立性质条目 |
| N03 | 矩阵乘法如何进行行列求和 | 关联同一 Concept，新建计算方法条目 |
| N04 | PyTorch 的 torch.mm 矩阵乘法用法 | 关联同一 Concept，新建应用条目 |
| N05 | 矩阵加法 | 负对照：指向原有矩阵加法 Concept，不能误归矩阵乘法 |
| N06 | 逐元素乘法 | 负对照：指向原有逐元素乘法 Concept，不能误归矩阵乘法 |
| N07 | 另一篇笔记再次讲维度匹配 | 关联同一 Concept，并复用 N01 的规则条目，追加来源 |

**校验维度**：Concept ID、是否新建概念、是否新建/复用条目、知识类别、逐字来源是否存在、重复来源是否保留、是否误合并负对照。对陈述真实性和引用语义支持，仍需人工审查。

## 安全边界

- 固定公开样本在 **scenario.mjs** 中，**无法通过命令参数读取任何用户笔记路径**。
- 仅在 main 分支合入专用 GitHub Actions 工作流时运行一次，或由仓库管理员手动发起；从不在 PR 事件中读取 Secret。
- 现有 GitHub Secret **DEEPSEEK** 只映射到单次实验的 **DEEPSEEK_API_KEY** 环境变量，不打印或上传密钥。
- 模型：deepseek-chat，temperature=0，最多 7 次调用，每次 max_tokens=1536。调用失败不会重试刷费用。
- AI 生成的一切知识变更都在**本次内存模拟图**，没有操作正式 KnowledgeItem、Concept、MCP、试题或 RAG 数据。
- 仓库是公开的；报告只包含公开合成笔记、模型分析结果、统计和内存图，不能替换成私有笔记。
- 数据只是七个简单例子，**成功只说明该受控场景下可行**，不是准确率保证、真实知识库融合成功，更不意味着可以跳过用户审核。
- 如果自动评分与人工阅读冲突，应以源语义及独立复核为准。模型有可能引用正确却凭空添加错误陈述。

## 使用

不产生费用、构造输入/测试本地逻辑：

    node --test scripts/test/concept-linking.test.js

需要真实 DeepSeek 调用时，由 **GitHub Actions** 的 “Knowledge Concept linking (synthetic DeepSeek)” 自动运行；结果见 Actions 的 Step Summary 和 7 天保留的报告 Artifact。无须把 API Key 发到聊天。

独立手动运行（已在安全环境变量中设置 DEEPSEEK_API_KEY 时）：

    node scripts/experiments/concept-linking/run.mjs

不调用 DeepSeek 的只读模式：

    node scripts/experiments/concept-linking/run.mjs --dry-run

默认报告目录为被 Git 忽略的 **storage/experiments/concept-linking/**，**不得把个人笔记替换进本实验并提交公开仓库**。

## 结果解读

只有 N01 的 Concept 真正创建、N02–N04、N07 使用同一 ID、N05 和 N06 不误合并、N07 复用第一条 KnowledgeItem 且保留来源，才能认为达到了我们在纸面上定义的“融合”。

Concept 命中 7/7 和条目动作命中 7/7 是**预设判定结果**，不是现实世界语义正确率；即使全部通过，下一步仍需要更大样本、不同表达、同名异义、用户审查及正式领域建模研究。
