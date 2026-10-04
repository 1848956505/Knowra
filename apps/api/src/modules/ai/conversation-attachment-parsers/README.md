# 会话附件离线解析

入口 `parseConversationAttachment({ buffer, fileName, mimeType })` 返回 Promise：

```js
{ kind, status: 'ready' | 'unsupported' | 'failed', text,
  segments: [{ label, start, end, page? }], errorCode?, width?, height? }
```

`start/end` 为 `text` 的 UTF-16 绝对偏移。DOCX 段落和 PDF 页面之间可能有换行间隔；调用方应保留间隔以重构原文本和哈希。错误不返回部分正文，不能将截断或解析失败当作完整资料。

TXT/MD 使用严格 UTF-8，支持 UTF-8 BOM，拒绝 UTF-16、无效字节和二进制控制字符。DOCX 使用 [Mammoth 1.13.0](https://github.com/mwilliamson/mammoth.js)，仅提取原始文本，不生成 HTML；旧 DOC 明确不支持。PDF 使用 [Mozilla PDF.js 6.4.299](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)，只读取内存字节的文字层，页面保留页码；扫描 PDF 无文字层时失败，不尝试 OCR。

DOCX 先用 [yauzl 3.4.0](https://github.com/thejoshwolfe/yauzl) 逐项校验路径、加密标记、声明/实际展开大小、CRC 和 XML。拒绝 DTD、实体定义，以及外部图像、模板或文件关系；外部超链接只保留可见文字。ZIP 从不解压到磁盘。PNG/JPEG 校验签名、PNG CRC、JPEG marker 结构、尺寸和像素限额；仅验证元数据与容器结构，不解码像素，也不声称识别图片内容，始终返回 `AI_ATTACHMENT_VISION_UNSUPPORTED`。

## 限额与隔离

每文件 5 MiB；ZIP 最多 256 条目、总展开 12 MiB、每项 4 MiB、压缩比 100；文本最多 200,000 UTF-16 单位、2,000 个来源片段（服务补换行间隔后最多 4,000 个持久片段）；PDF 最多 100 页/100,000 文字项；图片最多 20 MP，单边最多 12,000 像素。任意超限明确失败，不截断为 `ready`。

当前解析仅在 Linux 且提供 `prlimit` 时启用。每次使用独立短命 Node 子进程：8 秒墙钟/CPU、896 MiB 地址空间、96 MiB V8 heap，最多 2 个并行进程，输出协议最多 2 MiB。V8 使用单线程、禁 JIT、禁从字符串生成代码；无继承凭据环境。Node 文件读取仅授予解析器和实际依赖目录，禁止文件写入、子进程、原生 addon 和 worker。

[Node 24 权限模型](https://nodejs.org/download/release/v24.19.0/docs/api/permissions.html) 没有网络权限范围，也不是恶意代码安全沙箱。解析库配置不加载外部资料，子进程额外阻断 fetch、HTTP/TLS、TCP、UDP、DNS 等网络 API；这属于防止解析库意外联网的应用层屏障，不能称为 OS 级禁网。当前云环境 bwrap/unshare 网络隔离不可用，失败证据已回报。

其他平台或缺少隔离能力返回 `AI_ATTACHMENT_ISOLATION_UNAVAILABLE`，保留上传状态并明确解析失败，不静默切到主进程。此次未安装 Mac，也未宣称跨平台 App 已完成 PDF/Word 理解。真正启用其他平台解析，需要提供等价、经过验收的隔离启动器。
