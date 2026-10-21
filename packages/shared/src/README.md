# 共享规则

ESM JavaScript 与 `.d.ts` 随源码发布，无独立编译步骤。此包保持无 DOM、框架、文件系统或 HTTP server 依赖。

## 附件规则

通过 `@study-accelerator/shared/attachments` 导入。

- `attachmentIdsInText`：保守扫描附件内容 URL，路径 ID 单次解码；fragment 不覆盖资源 ID，异常编码不抛出。
- `hasAttachmentReference`：递归识别正文 URL、结构化 attachmentId 与附件来源关系，支持循环对象。
- `MAX_ATTACHMENT_UPLOAD_BYTES` / `MAX_ATTACHMENT_RESTORE_BYTES`：新上传 5 MiB、原文件恢复 6 MiB。

消费者为 API 删除依赖预检、同步引用校验，以及经 web-core 出口接入的 V4。

## Knowra 正文标记

通过 `@study-accelerator/shared/knowra-marks` 导入，规则见 `docs/知识库与试题模块/标注功能/重点标记内联化方案.md` 第 2 节。

- `parseKnowraMarks`：返回行内标记、块级标记（含 `s=code` 代码区间）和不合法标记的问题列表。
- 代码字面边界复用 CommonMark/GFM 解析器，覆盖缩进代码、引用/列表内围栏和跨行 code span；字面标签不派生重点、不从比较文本中剥除，插入落点也不得进入这些范围。
- `stripKnowraMarks`：去掉全部有效标记，其余文字逐字不变；不合法标记当普通文字保留。`stripKnowraMarksMapped` 另附原文 → 去除后偏移的换算。
- `insertKnowraMarks` / `formatKnowraMarkOpen` / `formatKnowraMarker` / `knowraCheck`：迁移与编辑器序列化使用。插入只做文本层校验，与强调、链接等结构的嵌套由调用方按语法树保证；`snap` 把落在转义、行内代码、实体中间或紧跟普通反斜杠的边界向外调整，`onInvalid` 跳过并报告单条不合法标记。

消费者：V4 `features/editor/editorKnowraMarks.ts`。

## 验证

仓库根目录执行 `npm run test:shared`。新增出口同时检查 CI 发布包、web-core 构建及桌面 bundle。

## 增量报告审阅纯契约

`@study-accelerator/shared/incremental-review` 提供版本化 envelope 的有界验证、逐项内存选择、草稿导出与恢复；源码 ESM + `.d.ts`，无额外构建、Node/DOM/IO 依赖。`validateReviewDraft` / `parseReviewDraft` 返回重验后的完整草稿，`parseReviewFile` 统一返回 `{ report, session }`：原报告从空选择开始，草稿恢复已选/待定项，未决定项不进入 session。草稿必须按报告顺序覆盖全部稳定提案 ID，风险原因和计数重新推导并核对；任何错误均整体拒绝。风险项和条目 reuse 仅允许待定，恢复和导出均不是提交许可。详见 [契约说明](../../../scripts/experiments/knowledge-incremental/REVIEW-ENVELOPE.md)。
