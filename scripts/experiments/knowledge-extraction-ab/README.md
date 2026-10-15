# 知识提炼 A/B 实验（研究工具，不是生产提炼）

目的：在**不写入知识库、不修改线上提示词、不依赖正式 Concept schema** 的前提下，比较线上 v1 和 v2（标题指引 + 既有标题上下文）提炼效果。

## 本轮修正（2026-10-15）

- A/B 校验对齐主程序 **PR #151** 的规则：原偏移正确直接采用；否则在本次所选片段内按 `quote` **唯一定位**。找不到、多处歧义或 UTF-16 边界无效仍拒绝。
- 报告分别统计：原偏移正确、可重新定位、引文最终有效、真正无效；标题问题独立统计，不因偏移错位全部失去意义。
- v2 在上一篇**整批通过校验**后，模拟采用其标题，加入下一篇的已有标题上下文；实际知识库没有写入。可用 `--existing` 预置人工整理的标题，每行一个。
- 默认输出改为仓库已忽略的 `storage/experiments/knowledge-extraction-ab/`；旧版 `tmp-knowledge-ab/` 也加入 .gitignore。
- 增加仅使用合成笔记、无 API 调用的回归测试，覆盖重叠笔记复用、引用错位/歧义、UTF-16 等。

**注意**：“已有标题”逐篇累积仅是对“假设用户确认了整批有效候选”的模拟，**不是正式知识复用或 AI 语义消歧的验证**。即便模型使用同名标题，也可能对应不同概念。人工评审仍必不可少。

## 使用方法

在仓库根目录（Node.js >=24、安装项目依赖）：

```bash
# 免费、不发起模型调用：查看要发送的提示词与输入结构
node scripts/experiments/knowledge-extraction-ab/run.mjs \
  --notes scripts/experiments/knowledge-extraction-ab/fixtures \
  --dry-run

# 真实 A/B：这一步会调用 DeepSeek API、产生费用。先自行在 shell 里设置 DEEPSEEK_API_KEY。
node scripts/experiments/knowledge-extraction-ab/run.mjs \
  --notes scripts/experiments/knowledge-extraction-ab/fixtures \
  --variants v1,v2 \
  --key-env DEEPSEEK_API_KEY

# 明确预置已有知识点标题，避免仅依靠模拟逐篇累积
node scripts/experiments/knowledge-extraction-ab/run.mjs \
  --notes scripts/experiments/knowledge-extraction-ab/fixtures \
  --existing scripts/experiments/knowledge-extraction-ab/fixtures-existing-titles.txt \
  --variants v1,v2 --key-env DEEPSEEK_API_KEY

# 不发起模型调用的回归测试
node --test scripts/test/knowledge-extraction-ab.test.js
```

**关于隐私：** 真实运行的 `raw.json`、`report.md` 和 `*.request.json` 可能包含笔记原文及 AI 输出，**不得提交到 GitHub，尤其是公开仓库**。默认输出放在忽略目录；若使用 `--out` 自定位置，请确保它位于 Git 忽略目录或仓库外。请勿在命令中明文写 API key。真实实验请只使用获准外发的资料。

## GitHub Actions：Secret 不进入聊天

仓库的 [Knowledge extraction A/B (synthetic DeepSeek)](../../../.github/workflows/knowledge-extraction-ab.yml) 专用工作流读取 **Repository Secret `DEEPSEEK`**，仅在执行模型调用的步骤将其映射为 `DEEPSEEK_API_KEY`。不需要公开密钥，也不必将它保存到 Markdown、GitHub Issue 或代码中。

- 工作流**只会使用本目录 `fixtures/` 下的三篇公开合成笔记**，按 v1、v2 各调用一次每篇，共最多 6 次请求；`--max-tokens 2048` 为每次请求限定模型输出上限。
- 第一次合并此工作流到 `main` 时自动跑一次；后续可以在 GitHub Actions 页面手动运行，**不监听 PR、其它分支 push 或定时事件**。
- 如果 Secret 缺失或无效，将按错误停止，不会尝试获取或打印密钥。
- Actions step summary 只显示汇总指标，Artifacts **仅上传合成样本的 `report.md`**（保留 7 天）。完整 `raw.json` 不上传。
- 供应商错误响应内容不会原样打印到公开日志；对比结果仅代表**合成笔记上的一次运行**，不能代表真实私人笔记的普遍表现。
- 本工具不会接入 Knowra 生产提炼、不会读取用户笔记、不会保存正式知识点，也不会向 GitHub 提交实验结果。
- 使用 Repository Secret 时，应限制仓库写入权限；具有写权限的协作者可能通过修改 workflow 来使用 Secret。试验完成如不再需要，可删除或轮换此 Secret。

## 推荐测试设计

1. **引用可靠性**：原偏移、唯一 quote 重定位、多处 quote、找不到 quote、含 emoji 的 UTF-16 边界。
2. **标题命名**：问题句、“的定义”空泛后缀、错误照抄小标题（但“点积”等合法标题不是必然错误）。
3. **复用已有标题**：通过有重叠的不同笔记比较复用数量，核查语义是否真同一概念；不要只看逐字匹配。
4. **来源与真伪**：AI 是否未经提示悄悄纠正原笔记的错误（API 拼写、定义等）；引用能找到原文不代表 AI 的陈述正确。
5. **成本与用户负担**：输入输出 token、候选条数、需要人工修改/删除/撤销的次数。
6. **重复运行**：相同资料多次运行以观察不稳定性；模型 temperature=0 也不能保证输出绝对一致。

## 范围边界

本工具**不启用生产 v2**，不自动抓取知境已有正式知识点，不创建 Concept，不修改 schema，不把真实来源写入数据库。真实知识检索、隐私授权、同名异义消歧、审核通过后合并知识属于后续工作。

本轮评审与建议见：[GPT-6 第一阶段记录](../../../docs/知识库与试题模块/讨论记录/2026-10-15_知识提炼实验复核与第一阶段建议_GPT-6.md)。
