# 正式前端—离线 UI demo 对齐说明

> 本文用于约束 demo 与正式前端（`apps/web/` 下 vanilla JS SPA）的对齐：demo 复用正式项目的视觉令牌与 DOM 结构，不重写正式项目已有的实现（Milkdown、API、附件、标注、拖拽、右键菜单等）。

## 1. 结论

当前 demo 是正式前端 UI 的**离线镜像**，不是第二套业务实现。

- demo 负责呈现正式项目的视觉/结构/文案/交互入口；
- 正式迁移继续复用 vanilla JS 控制器、API、Milkdown 编辑器、状态和测试；
- React + Vite 仅作为容器，便于快速生成可双击打开的单文件 HTML；
- demo 不接真实后端；保存/导出/格式命令为 React state 模拟，不会持久化。

## 2. 对齐点（demo ↔ 正式项目）

| 正式项目能力 | 正式实现位置 | demo 对齐位置 | 对齐状态 |
| --- | --- | --- | --- |
| 设计令牌 | `apps/web/styles/components/knowra-theme-tokens.css` | `src/styles.css` `:root` | 完全复用同一套 token |
| 应用外壳 | `apps/web/styles/components/knowra-shell.css` | `src/styles.css` `.knowra-production-shell` + `.knowra-rail` | 结构、class、data-* 一致 |
| 资料库索引 | `apps/web/lib/library-index/renderers.js` + `knowra-library-index.css` | `IndexView` 组件 | 4 列网格 / masthead / tabs / 筛选 / 详情栏 一致 |
| 文档头 | `knowra-editor.css` + `lib/library-index/renderers.js` | `EditorView` 文档头 | 61px 编号 + 4px 蓝线 + 标题 input 一致 |
| 编辑器菜单 | `lib/editor/menu-renderers.js` | `EDITOR_MENUS` 常量 | 5 菜单 / 26 条命令 / 8 个常用工具，文案完全一致 |
| 资料边注 | `lib/sidebar/*` + `knowra-editor.css` | `EditorView` 边注 + 4 tab | 信息 / 大纲 / 重点 / AI 顺序与字段一致 |
| 状态栏 | `lib/status/renderers.js` | `StatusBar` 组件 | 42px / 保存指示 / 字数行数 / 源码/边注切换 / UTF-8 / 本地优先 |
| 标签样式 | `.tag-row` + `.pill` | 复用 | 蓝色描边 chip |

## 3. demo 仍由正式项目接管的部分

以下能力由正式项目 `apps/web/lib/` + `apps/web/src/` 现有实现接管，demo 不重写：

- Milkdown 编辑器与 ProseMirror 插件（占位用静态 `.prose` 容器展示渲染样式）
- 附件文件操作（上传 / 重命名 / 删除 / 引用保护 / 右键菜单）
- Annotation 锚点与重要内容标注的定位、撤销、并发保护
- API 持久化与本地优先加载链路（SSR → cache → API → mock）
- 目录与标签页拖拽、右键菜单模型
- 错误恢复与现有测试体系

## 4. 已知差异

- **数据**：demo 内置 3 条资料 + 2 个文件夹 + 4 个标签；正式项目通过 `/api/knowledge/*` 拉取
- **编辑器**：demo 用 React state + 极简 `renderMarkdown` 静态展示；正式项目用 Milkdown 富编辑
- **图标**：demo 用内联 SVG（替换原 Phosphor Icons 以减体积）；正式项目同样内联 SVG
- **查找替换**：demo 面板字段可用但不执行查找；正式项目由 Milkdown 命令接管
- **表格弹窗 / 右键菜单**：demo 不实现；正式项目由 `lib/editor/table-dialog-renderers.js` + `lib/navigation/context-menu.js` 等接管

## 5. 压力状态覆盖

demo 已覆盖：

- 1280×800 与 1440×1024 桌面视口
- 资料条目展开/选中/打开
- 编辑器菜单展开、常用工具按下、标签页切换/关闭、查找替换面板
- 资料边注 4 tab 切换
- 状态栏指示、源码 / 边注 / 阅读 / 专注模式入口
- 索引详情栏收起/展开
- 索引筛选下拉、搜索框聚焦高亮

由正式项目接管的压力状态（demo 不复现）：

- 6 个以上打开标签的溢出收缩与拖拽
- 真实数据量下的列表 / 目录独立滚动
- 附件 / 标注的真实操作链路
