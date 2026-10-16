# 知境：已确认知识复用与来源隔离第三轮实验

> **研究工具，不是生产功能。** 使用固定公开合成资料，内存处理，不改正式 Concept、KnowledgeItem、数据库、笔记或索引。

## 为什么还要再测

在此前 [十案例压力实验](../knowledge-hardcases/README.md) 中，DeepSeek 完成 10/10 次 API 响应，但 H02、H04 的“复用已有确认知识”被校验拒绝。模型已经正确找到 K_CHAIN/K_NONCOMM，却误把既有 `confirmed` 状态复制给本次提议；H04 还擅自添加了旧条目没有的 C_MATRIX 关系。

此外 H10 纠错时，模型把用户原文的错误 API 与其自行补充的正确写法混进**同一条来源为笔记的 statement**。这不符合“AI 可以补充，但不能冒充用户原话”的溯源原则。

## 本轮测试什么

| 案例 | 应验证的行为 |
| --- | --- |
| H02 | 复用 K_CHAIN；原有 confirmed 不变，新提议状态为 candidate |
| H04 | 复用 K_NONCOMM；不往旧条目增加 C_MATRIX；旧正文/状态不变 |
| H03 | 发现错误交换律，保留错误原话，作为 disputed 候选并指向 K_NONCOMM |
| H05 | 无笔记的 AI 补充公式：sourceMode=ai，quote=null，candidate |
| H10 | 原文错拼 `x.require_grad_(True)` 留在 statement，正确 `requires_grad_` 只能作为 AI 的独立解释写进 reason |
| U01 | 从未出现在前轮的另一种“自动微分 + 链式法则”说法，应复用 K_CHAIN |
| U02 | 另一种矩阵乘法不满足交换律的表达，应复用 K_NONCOMM |

原始预期标签只保存在脚本的 `CASES.expected`，不会发送给模型。系统提示词是**通用约束**，不会点名 H02/H04 或正确答案。

**评估口径：** 旧条目知识和状态不改变；新的候选一律等待审核；当来源无笔记时保留 AI 来源身份；对错误记录的 AI 纠正不得写入笔记原话字段。单次七案例，不能推断产品级准确率。

## 安全与费用

- 只使用仓库公开合成内容及启动时创建的合成知识目录；
- GitHub Actions 仅在本工作流**首次合并到 main** 时自动触发一次，以后仅通过 workflow_dispatch 手动启动；不使用 PR 或定时事件；
- Repository Secret `DEEPSEEK` 只注入模型调用步骤的环境变量 `DEEPSEEK_API_KEY`，不会在代码、报告、Actions summary 中显示真实值；
- 最多 **7 次** deepseek-chat 调用，temperature=0，每次输出上限 1600 tokens，失败不自动重试；
- 内容仅在研究脚本里模拟，不会接触用户私人笔记，也不会对正式知识执行创建、合并、覆盖或确认；
- GitHub Actions Artifact 只包含**公开合成数据**的报告/实验结果，保留 7 天；勿在此目录加入真实个人资料。

## 运行

免费无模型回归：

`node --test scripts/test/knowledge-reuse-followup.test.js`

不调用 API 的 dry-run：

`node scripts/experiments/knowledge-reuse-followup/run.mjs --dry-run`

在安全环境变量中提供 DEEPSEEK_API_KEY 的独立运行：

`node scripts/experiments/knowledge-reuse-followup/run.mjs --max-tokens 1600`

默认报告保存到 Git 忽略的 `storage/experiments/knowledge-reuse-followup/`。

## 结果解释

模型把条目 ID 选对，不代表它拥有了正式审核权限。即使此实验通过，也只说明**本套提示词与合成案例**之下能把状态与身份分开，不能替代更复杂真实笔记上的审查，更不能直接迁移正式 schema。

第三轮的独立审查与用户补充共识见 [GPT-6 复核记录](../../../docs/知识库与试题模块/讨论记录/2026-10-16_知识边界实验独立复核与再验证_GPT-6.md)。
