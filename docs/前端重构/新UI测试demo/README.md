# Knowra 正式 UI 离线 demo

本目录是 Knowra 正式前端（`apps/web/` 下 vanilla JS SPA）的**离线 UI 镜像**——保留 React + Vite 容器以维持单文件离线 demo 体验，视觉、结构、文案与正式项目完全对齐。

## 事实来源

- 正式前端样式令牌：`apps/web/styles/components/knowra-theme-tokens.css`
- 正式前端 UI 层：`apps/web/styles/components/knowra-*.css`（shell / library-index / editor / menus）
- 正式前端渲染层：`apps/web/src/server/shell-html.js` + `apps/web/lib/library-index/renderers.js` + `apps/web/lib/sidebar/*` + `apps/web/lib/editor/menu-renderers.js` + `apps/web/lib/status/renderers.js`
- 正式前端迁移记录：`docs/前端重构/正式前端迁移记录.md`（第二/三/四轮收口）

demo 的 class 命名、data-* 属性、CSS 变量与 DOM 结构均与正式项目一致；不重写正式项目已有的实现（Milkdown、API、附件、标注、拖拽、右键菜单等）。

## 已覆盖的产品路径

1. 左侧导航：品牌、资料库范围、模块切换、设置入口
2. 资料库索引：masthead / 内容范围 tabs / 类型·状态·时间筛选 / 全文搜索 / 资料条目 / 分页 / 详情栏
3. 编辑器：文档标签 / 顶部菜单 / 常用工具 / 查找替换 / 文档头 / 连续正文 / 状态栏
4. 资料边注：信息 / 大纲 / 重点 / AI 四个页签
5. 视图切换：阅读 / 编辑 / 专注；隐藏左侧 / 隐藏右侧 / 源码模式

## 不连接后端

demo 不连 Knowra 后端，不写项目数据。最简内置数据（3 条资料 + 2 个文件夹 + 4 个标签）仅用于视觉展示，编辑/保存/导出等为 React state 模拟，不会持久化。正式项目的 Milkdown、API、附件、标注、拖拽和右键菜单实现不会在 demo 中重复开发。

## 直接查看

双击同目录下的 `Knowra整合UI.html` 即可在 Chrome / Safari 打开，不需启动服务。

## 运行

```bash
npm install --legacy-peer-deps
npm run dev
```

## 构建

```bash
npm run build
```

生成可双击打开的独立 HTML：

```bash
npm run build:standalone
```

## 当前验收

- 视觉与正式项目 `npm run dev:web` 后的 `localhost:3000` 一致（米黄纸张 + 学术蓝 + 直角 + 蓝色顶线 + 编辑阴影）
- 资料库 `01` / 文档头编号 / 阅读分钟数统一为加粗窄体数字（`--font-display`）
- 标签使用正文 `tag-row` 蓝色描边组件
- 编辑器顶部 35px 标签栏 + 35px 菜单栏 + 独立滚动正文
- 状态栏 42px，含保存指示、字数、行数、源码、边注切换
- 视口：1440×1024 与 1280×800 均无横向溢出
- 与正式项目差异点：[`production-feature-map.md`](./production-feature-map.md)
- 视觉验收：[`design-qa.md`](./design-qa.md)
