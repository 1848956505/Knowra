# 共享附件规则

通过 `@study-accelerator/shared/attachments` 导入。ESM JavaScript 与 `.d.ts` 随源码发布，无独立编译步骤。

- `attachmentIdsInText`：保守扫描附件内容 URL，路径 ID 单次解码；fragment 不覆盖资源 ID，异常编码不抛出。
- `hasAttachmentReference`：递归识别正文 URL、结构化 attachmentId 与附件来源关系，支持循环对象。
- `MAX_ATTACHMENT_UPLOAD_BYTES` / `MAX_ATTACHMENT_RESTORE_BYTES`：新上传 5 MiB、原文件恢复 6 MiB。

消费者为 API 删除依赖预检、同步引用校验，以及经 web-core 出口接入的 V4。此包保持无 DOM、框架、文件系统或 HTTP server 依赖。

验证：仓库根目录执行 `npm run test:shared`。新增出口同时检查 CI 发布包、web-core 构建及桌面 bundle。

## 增量报告审阅纯契约

`@study-accelerator/shared/incremental-review` 提供版本化 envelope 的有界验证、逐项内存选择、草稿导出与恢复；源码 ESM + `.d.ts`，无额外构建、Node/DOM/IO 依赖。`validateReviewDraft` / `parseReviewDraft` 返回重验后的完整草稿，`parseReviewFile` 统一返回 `{ report, session }`：原报告从空选择开始，草稿恢复已选/待定项，未决定项不进入 session。草稿必须按报告顺序覆盖全部稳定提案 ID，风险原因和计数重新推导并核对；任何错误均整体拒绝。风险项和条目 reuse 仅允许待定，恢复和导出均不是提交许可。详见 [契约说明](../../../scripts/experiments/knowledge-incremental/REVIEW-ENVELOPE.md)。
