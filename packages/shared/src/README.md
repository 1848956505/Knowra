# 共享附件规则

通过 `@study-accelerator/shared/attachments` 导入。ESM JavaScript 与 `.d.ts` 随源码发布，无独立编译步骤。

- `attachmentIdsInText`：保守扫描附件内容 URL，路径 ID 单次解码；fragment 不覆盖资源 ID，异常编码不抛出。
- `hasAttachmentReference`：递归识别正文 URL、结构化 attachmentId 与附件来源关系，支持循环对象。
- `MAX_ATTACHMENT_UPLOAD_BYTES` / `MAX_ATTACHMENT_RESTORE_BYTES`：新上传 5 MiB、原文件恢复 6 MiB。

消费者为 API 删除依赖预检、同步引用校验，以及经 web-core 出口接入的 V4。此包保持无 DOM、框架、文件系统或 HTTP server 依赖。

验证：仓库根目录执行 `npm run test:shared`。新增出口同时检查 CI 发布包、web-core 构建及桌面 bundle。
