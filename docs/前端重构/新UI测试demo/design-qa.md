# Design QA — Knowra 离线 UI demo

日期：2026-07-19

## 视觉事实来源

- 设计令牌：`apps/web/styles/components/knowra-theme-tokens.css`
- 主 UI 样式：`apps/web/styles/components/knowra-*.css`（shell / library-index / editor / menus）
- 收口记录：`docs/前端重构/正式前端迁移记录.md`（第二/三/四轮）
- 历史 QA 截图（参考用）：`docs/前端重构/qa-round4-*.png`

## 实现证据

- 离线版：`Knowra整合UI.html`（254KB，单文件可双击打开）
- 视口：1440×1024、1280×800
- 验证状态：与正式项目 `apps/web/` 下 SPA 的视觉与结构一致

## 视觉对齐

与正式项目 knowra 体系的关键对齐点：

- **设计令牌**：`--paper #f5f3ec` + `--blue #1646d8` + `--ink #161616` + `--acid #e9ff4f`；统一直角（`--radius-none`）
- **左侧导航**：260px 宽；品牌 K 字标 + 资料库三段式 header + 资料/收藏/最近/回收站四组 + 6 个方形模块按钮
- **资料库索引**：masthead 三段式（标题 / scope / 新建按钮）+ 4 个下划线式内容 tabs + 3 组筛选下拉（直焦蓝色顶线菜单）+ 资料条目 4 列网格（编号 / 内容 / 时间 / 阅读分钟）+ 详情栏 83px 高蓝色"打开资料"
- **编辑器**：35px 标签栏（含关闭按钮）+ 35px 菜单栏（5 菜单 + 常用工具）+ 文档头（61px 编号 + 4px 蓝线 + 大标题 input）+ 920px 限宽 + 1.86 行高正文
- **资料边注**：双语标题 `资料边注　MARGINALIA` + 4 tab（信息 / 大纲 / 重点 / AI）+ 字段表 + 大纲 H1/H2/H3 层级导轨
- **菜单/弹窗**：统一 `padding: var(--space-1) 0` + 1px 黑边 + 3px 蓝色顶线 + `--shadow-editorial` 阴影，无圆角
- **状态栏**：42px 高，编辑页可见；含保存指示（酸黄/蓝色圆点）、笔记/目录/字数/行数/源码/边注/UTF-8/本地优先

## Findings

- 未发现 P0、P1 或 P2 问题。
- 字体与层级：双语边注标题、页签、图标区标题、字段和值形成稳定层级；展示字使用 Archivo Narrow + Noto Sans SC
- 间距与节奏：页签顶部和底部各一条线；信息区不额外加顶线；常开区与折叠区之间保持统一段落间距
- 色彩与令牌：标签、活动页签、大按钮、当前大纲、hover/active 态使用既有 `--blue` / `--blue-dark`，无新增色值
- 图标：保持内联 SVG（替换原 Phosphor Icons 以缩减包体积；图标语义不变）
- 文案：所有可见中文与正式项目 `lib/library-index/renderers.js` + `lib/editor/menu-renderers.js` 等保持一致

## 交互与技术检查

- 资料索引：打开资料按钮可用；资料信息与标签常开；详情栏可收起/展开
- 编辑器：5 个菜单可展开；常用工具可点；标签页可切换/关闭；查找替换面板可开关
- 资料边注：信息 / 大纲 / 重点 / AI 四个 tab 可切换；大纲 H1/H2/H3 层级可见
- 视图：阅读 / 编辑 / 专注、源码模式、左侧 / 右侧栏收起均在状态栏或菜单入口
- 1280×800 与 1440×1024 的 document scrollWidth 等于 viewport width
- 浏览器控制台无 error / warning

## 仍由正式项目接管的部分

demo 不重写：Milkdown 编辑器、附件文件操作、Annotation 锚点、API 持久化、SSR/缓存加载、错误恢复、目录/标签页拖拽、右键菜单模型。这些能力由正式项目 `apps/web/lib/` + `apps/web/src/` 现有实现接管，demo 仅展示入口与承载空间。

final result: passed
