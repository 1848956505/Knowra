# Mac 个人应用：构建与使用

> 2026-09-10。面向 Apple Silicon Mac 的个人使用版本。交付 `.app`，不走 App Store，不配置 Developer ID、公证或自动更新。产品功能验收由使用者亲自进行；开发侧仅做构建、回归与打包程序的工程冒烟检查。

## 打开应用

将 `知境·Knowra.app` 放进“应用程序”目录，双击打开，无需安装 Node、npm 或另外启动 API。菜单提供编辑快捷键、窗口操作和“打开本机资料目录”。关闭窗口、`⌘W` 和 `⌘Q` 均先请求页面保存正文，成功后结束本地服务；失败时保留窗口并显示原因。

输入法候选尚未确认时，请先确认或取消候选，再退出。系统强制结束进程不能执行退出握手，仍只能保证已提交到 SQLite 的数据。

应用从独立本机资料库启动，不自动导入仓库或线上数据。云端连接在底部状态栏设置，只有升级了同步接口的云端才能连接；本轮不部署云端。知识和训练资产仍按现有本地运行边界限制写入。

## 数据与升级

- 本机业务数据：`~/Library/Application Support/Knowra/offline`。
- 桌面窗口配置及日志：`~/Library/Application Support/Knowra/shell`。
- 同步登录凭据只保留在运行内存，退出后需要重新输入。
- 完整备份通过同步面板创建，恢复与独立救援导出见阶段 4/5 文档。
- 手动更新时先退出应用，保留备份，再替换 `.app`。替换程序不会清除独立资料目录。

个人版本采用本地 ad-hoc 签名，不是 Apple Developer ID 分发签名。若 macOS 拦截首次打开，按系统提供的“隐私与安全性”提示处理；不需要关闭全局安全保护。该构建未作其他 Mac、Intel 架构或所有 macOS 版本的兼容承诺。

## 构建

```bash
npm install
npm run build:mac
```

输出：`dist/mac/知境·Knowra-darwin-arm64/知境·Knowra.app`，以及 `dist/mac/知境·Knowra-Mac-arm64.zip`。可通过 `KNOWRA_ELECTRON_ZIP_DIR` 指向已下载的 Electron ZIP 缓存目录，避免重复下载。版本锁定在 lockfile；应用内置 Electron 运行环境，SQLite 在独立 utility process 中运行。

打包仅收集主进程、隔离 preload、编译后的本地服务和 V4 资源；不包含仓库 `storage/`、`.env`、云端凭据或测试资料。PostgreSQL 客户端不随本机服务分发，本机固定使用 SQLite，云端通过 HTTP 同步。

窗口启用 context isolation、sandbox 并禁用 Node integration；预加载只暴露保存握手。外部链接交给系统浏览器，本地服务保持回环会话隔离。

## 工程检查

- V4 类型检查、构建、架构边界及回归测试。
- 退出握手：附件在途等待、正文保存顺序、保存失败保留窗口、输入法候选阻止退出。
- 打包程序在隔离资料库启动，中文输入后立即退出，检查 SQLite 落盘并重新启动读取；确认渲染页面没有 Node `require`。
- `codesign --verify --deep --strict` 检查本地签名。

以上工程检查不代替用户验收；本轮不宣称真实云端、完整交互、所有异常退出和升级路径已经人工验收。

本轮最终工程记录：Electron 44.3.0、内置 Node 24.20.0；V4 回归 281 + 4 项通过，最后编辑器定向检查 15 项通过，打包程序冒烟 1 项通过。代码仍为未提交工作区。验证记录见 [Mac 应用工程检查](验收证据/Mac个人应用/验证记录.json)。

验收日志和验证记录仅保存在本机，不随公开源码仓库发布。
