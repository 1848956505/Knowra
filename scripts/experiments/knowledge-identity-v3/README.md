# 知境知识模型 V3：复用状态、混合笔记、AI 空来源与疑似重复

> 实验性质：仅使用本仓库公开合成样本，内存中模拟新增/复用；**不修改正式 KnowledgeItem、Concept、学习目标、数据库或 MCP，不自动确认任何新知识**。

## 已有实验与本轮问题

- 第一轮 [PR #160](https://github.com/1848956505/Knowra/pull/160)：相同 Concept ID 下挂多条不同 KnowledgeItem，并将重复内容追加来源。
- Claude 第二轮实验（Actions 38904135357）：在有限候选与干扰概念中，多轮正确挂靠，但当检索缺失真正的已有 Concept 时，模型新建了**疑似重复**概念，重复信号只存在自由解释中。
- 公开合成压力实验（Actions 38903414094）：验证多概念、矛盾主张与 AI 无笔记引用候选，但模型复用已确认条目时，额外输出 confirmed 状态、添加概念，旧契约拒绝了这类返回。

这次不重复普通分类题，而是直接改进**实验契约如何表达知识身份、状态、来源和歧义**。

## 五个固定合成场景

| 编号 | 问题 | 期望 |
| --- | --- | --- |
| V01 | 已确认的维度匹配条件被换一种写法重复记录 | 复用原 KnowledgeItem ID，只追加新笔记引用，不允许输出覆盖状态或原陈述的字段 |
| V02 | 同一篇笔记里有一个合理事实、一个错误交换律陈述和一个错误 PyTorch API | 拆成三条内容；其中两条为 disputed，并指向原已确认知识；不悄悄纠错、不污染旧数据 |
| V03 | 用户要求 AI 自主补充矩阵乘法的计算公式，没有给笔记 | sourceMode 由实验程序标记 ai，quote=null、candidate，仍可关联已有概念 |
| V04 | 检索没有返回矩阵乘法，只返回点积/逐元素乘法等干扰项；另给“全局疑似重复提示” | 不强挂错误 Concept，不直接写入隐藏的原有 ID；只能创建待确认概念候选，并用 possibleDuplicateOf 结构化提示已有 Concept |
| V05 | 矩阵加法的概念及定义 | 复用已有矩阵加法 Concept，定义可标记 definition 或 fact，无需再次建同名概念 |

## 与上一轮的重要语义改动

**复用不是创建。** 本实验使用两种严格不同的 JSON 形状：

- reuse 只有 existingItemId、quote、reason，不让模型重新决定旧条目的 status、statement 和 conceptIds；旧条目仍保持 confirmed，只增加新的来源。
- new 有 conceptIds、kind、statement、reviewStatus、conflictsWithItemIds 等，只能进入 candidate/disputed。
- origin/sourceMode **由可信的实验请求**而不是模型自述决定：笔记包含逐字 quote；AI 补充保留空笔记来源，同时记录为 ai 和 candidate。
- 检索没有返回的 ID 不能自动引用；duplicateHints 仅提供“可能已经存在”的提示，可生成 possibleDuplicateOf 但不得自动合并。

**这是实验 schema，不是批准要把字段原样移植到生产。**

## 如何运行

只测试结构、没有模型费用：

    node --test scripts/test/knowledge-identity-v3.test.js

模拟请求，不外发：

    node scripts/experiments/knowledge-identity-v3/run.mjs --dry-run

在被授权且配置了 DEEPSEEK_API_KEY 的环境发起真实模型调用：

    node scripts/experiments/knowledge-identity-v3/run.mjs

也可以等待本目录所对应的 GitHub Actions 专用工作流第一次合并到 main 后，自动运行一次（以后只手动触发）。

工作流使用 Repository Secret **DEEPSEEK**，仅固定 5 个公开合成案例、deepseek-chat、temperature=0、每次最多 2400 输出 tokens，不重试。只上传此公开合成报告和候选 JSON，Artifact 保留 7 天。

**严禁发送或上传私密笔记及 API Key**。脚本不提供 --notes、--model、--url 参数；默认本地报告位于 Git 忽略的 storage/experiments/knowledge-identity-v3/。

## 如何解读

结构通过只是格式与来源约束正确，**不代表模型陈述数学上正确、冲突判断正确或知识来自可靠来源**。自动评分仅核对五种预设行为；尤其关注 V02 的错误笔记是否被悄悄修改，V03 的公式是否有数学问题，V04 是否提出恰当的疑似重复候选。

即使全部通过，也还没有验证真实数据库同步、可逆合并、检索召回率、多用户隐私授权或长笔记复杂场景。下一轮需要人工审阅，再决定哪些观点进入正式领域冻结稿。
