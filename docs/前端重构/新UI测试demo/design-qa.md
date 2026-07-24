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

基线结果：passed

---

## 2026-07-21 档案馆标记专项 QA

### 比较目标

- Source visual truth：`reference-archive-mark-original.png`
- Implementation screenshot：`qa-archive-mark.png`
- Viewport：1280×720（并用 DOM 尺寸检查 1490×900）
- State：资料索引首条选中，右侧资料详情展开
- Full-view comparison evidence：`reference-archive-row.png` 与 `qa-archive-row.png`
- Focused region comparison evidence：`reference-archive-mark-focus.png` 与 `qa-archive-mark-focus.png`

### Findings

- 未发现可执行的 P0、P1 或 P2 问题。
- 字体与层级：馆藏号继续使用 `--font-display` 和大写字母，收拢为可直接对应未来 ID 系统的 `ARCHIVE-001`；字重和字距与页面其他英文小标签一致。
- 间距与布局：三只档案盒等高、共用一条底部基线，在顶梁、两侧立柱和底部层板之间居中；1280px 与 1490px 均无水平溢出。
- 色彩与令牌：未新增色值，未选中状态使用现有 `--muted` / `--muted-soft`，选中与悬浮状态使用 `--blue`。
- 图标质量：档案盒来自项目已安装的 Phosphor `Book` 矢量图标，通过统一拉伸比例与框架布局形成专用档案架标记；无模糊位图、表情符号或占位图形。
- 文案与语义：可见编号为 `ARCHIVE-001` / `002` / `003`，辅助语义为“档案编号 ARCHIVE-001”，与 `[type]-[id]` 规则一致。

### Comparison history

1. 首轮证据 `reference-archive-mark-original.png` 显示 P1：第三本书带倾角，且只有底层板，无法形成稳定的档案架轮廓；`ARCHIVE` 和 `#001` 分居两侧，未直接呈现 ID 格式。
2. 修复：改用三只直立 Phosphor `Book`，补齐顶梁、两侧立柱与底部层板，并将编号收拢为 `ARCHIVE-001`。
3. 第二轮证据 `qa-archive-mark-intermediate.png` 显示 P2：图标默认正方形 viewBox 导致档案盒在高型容器内缩成小方块。
4. 修复：使用 `preserveAspectRatio="none"` 保持档案盒填满高型尺寸，三只档案盒统一为 46px 高（窄屏 36px）。
5. 复查证据 `qa-archive-mark.png` 显示原 P1/P2 均已消除。

### 交互与技术检查

- 点击第二条资料后，选中标记更新为 `ARCHIVE-002` 且计算颜色为 `rgb(22, 70, 216)`；再点击首条可恢复原状态。
- 独立 HTML 中共渲染 3 个档案标记，编号依次为 `ARCHIVE-001` 至 `ARCHIVE-003`。
- 1280×720 下水平溢出为 0，浏览器控制台无 error / warning。
- `npm run build:standalone` 通过，生成的 `Knowra整合UI.html` 已同步最新组件与样式。

### Open Questions

- 无。未来如果类型前缀由数据模型提供，只需将当前常量 `ARCHIVE` 换成字段值，不需改动标记布局。

### Implementation Checklist

- [x] 档案盒全部直立且对齐。
- [x] 补齐档案架的顶梁、立柱和底部层板。
- [x] 使用 `ARCHIVE-001` 形式呈现类型前缀和 ID。
- [x] 保留选中、悬浮与窄屏状态。
- [x] 重新构建独立 HTML 并完成浏览器验证。

### Follow-up Polish

- 无阻断交付的 P3 项。

final result: passed

---

## 2026-07-22 索引页层级与交互收紧 QA

### 比较目标

- Source visual truth：`qa-before-ui-refinement.png`，并以 `/Users/rabbids/.codex/visualizations/2026/07/22/019f8901-736b-7cb2-9b6e-915219429c5e/knowra-library-index-audit/audit.md` 中确认的改进方向作为差异规范。
- Implementation screenshot：`qa-ui-refinement-final.png`。
- Viewport：主检查为 1440×1024 CSS px，`deviceScaleFactor = 1`，实现截图为 1440×1024 px；补充检查为 1280×800 CSS px，截图为 1280×800 px。
- State：资料索引首条选中，右侧详情展开。
- Full-view comparison evidence：`qa-ui-refinement-comparison.png`。基线截图为 1440×810 px，比较时将实现截图按相同顶部区域裁切到 1440×810 px，再以 4px 蓝色分隔线并排合成；未进行缩放。
- Focused region comparison evidence：`qa-ui-refinement-focus.png`，对比页首、筛选区与前三条资料的 1040×610 px 中央区域。

### Findings

- 未发现可执行的 P0、P1 或 P2 问题。
- 字体与层级：保留 Noto Sans SC / Archivo Narrow 组合；页首改为 11px `KNOWRA INDEX` 眉题与 42–52px 中文主标题，去掉重复的 `LIBRARY INDEX`，详情栏增加“当前预览”状态标签。
- 间距与布局：masthead 从 92px 收紧至 76px，列表行从 146px 收紧至 124px；档案标记从 100×86px 降至 72×62px。1440px 首屏完整显示三条资料和分页，1280px 下无水平溢出。
- 色彩与令牌：主色、纸张色和边线系统不变；弱文字从 `#73726c` 提高到 `#66655f`，`--muted-soft` 从 `#96948c` 提高到 `#87857d`，降低小字号低对比风险。
- 图像质量与资产：沿用用户已确认的三册书籍矢量标记，仅缩小占位并降低视觉权重；没有新增占位图、模糊位图或额外视觉资产。
- 文案与内容：左栏移除重复的 `CONTENT & FOLDERS`，范围栏移除 `SCOPE`；搜索文案收紧为“搜索资料、标签或附件”；排序序号改为基于笔记 ID 的稳定引用码 `REF · N-001`。
- 交互：标题与常驻“打开”按钮均可进入资料；搜索会实际过滤标题、摘要、文件夹和标签；类型、状态、时间筛选和页签计数使用真实数据。

### Comparison history

1. 首轮实现证据 `qa-ui-refinement-pass1.png` 出现 P1：masthead 高度压缩后，范围名称和统计信息在 76px 容器内发生挤压。
2. 修复：范围摘要改为居中网格，增加 4px 间距并压缩统计行行高。复查 `qa-ui-refinement-pass2.png` 后文字完整显示。
3. 1280px 检查证据 `qa-ui-refinement-1280.png` 出现 P2：较长摘要换成两行后，第二条资料的标签贴近并部分越过行底。
4. 修复：索引摘要统一为单行省略。复查 `qa-ui-refinement-1280-final.png` 后三条资料的标签都位于行内，`document.scrollWidth === viewportWidth === 1280`。
5. 最终证据 `qa-ui-refinement-final.png` 与 `qa-ui-refinement-focus.png` 显示原 P1/P2 均已消除。

### 交互与技术检查

- 搜索“卡片”后只保留“卡片笔记写作法”一条资料。
- 选择“卡片笔记写作法”后，中间选中行、左侧目录高亮和右侧预览标题三处同步。
- 点击该行常驻“打开”按钮后进入 editor，标题为“卡片笔记写作法”，返回资料索引入口存在。
- 1280×800 下 `document.scrollWidth` 与 viewport width 均为 1280，无横向溢出。
- 独立 HTML 与开发预览的浏览器控制台均无 error / warning。
- `npm run build:standalone` 通过，`Knowra整合UI.html` 已同步最终组件与样式。

### Implementation Checklist

- [x] 压缩页首和列表密度。
- [x] 将装饰序号改为稳定引用码。
- [x] 增加“当前预览”状态说明。
- [x] 让标题与“打开”入口持续可见且可操作。
- [x] 减少重复双语文案并加强搜索框。
- [x] 提高弱文字对比度。
- [x] 修复 1280px 下摘要与标签拥挤。
- [x] 重建独立 HTML 并复测核心交互。

### Follow-up Polish

- P3：如果未来资料数量明显增加，可以补一个“舒适 / 紧凑”密度切换；当前三条示例不需要增加额外控制。

final result: passed

---

## 2026-07-22 现代档案夹标记专项 QA

### 比较目标

- Source visual truth：用户提供的三册立体档案夹参考图
- Implementation screenshot：`/Users/rabbids/.codex/visualizations/2026/07/20/019f7fee-5b70-7f82-bf6d-84abb5b7b572/13-demo-archive-status.png`
- Viewport：1280×720
- State：资料索引首条选中，右侧资料详情展开

### Findings

- 未发现 P0、P1 或 P2 问题。
- 密度：由五只窄书脊调整为三只宽体资料夹，保留清晰间隙，避免继续呈现柱状图或密集书架感。
- 立体感：每只资料夹由正面、顶部和侧面组成，使用统一蓝色线框与极浅蓝面，保留现代化的档案盒轮廓，避免复古木质或卡通效果。
- 细节：保留简化标签框和装订环，移除多余书脊细线；底部使用轻量底座和两侧支撑，整体与索引页的直角编辑风格一致。
- 色彩与令牌：仅使用现有 `--blue`、`--blue-wash`、`--paper-raised`，未新增色值。
- 状态层级：未选中档案夹使用 `--muted-soft` 灰线，选中后使用 `--blue` 蓝线；索引条目标签默认灰色描边，悬停或选中时切换为蓝色描边，视觉焦点只集中在当前条目。

### 交互与技术检查

- 点击第二条资料后，3 个条目中保持 1 个选中态，索引选择交互正常。
- 1280×720 下页面无水平溢出，档案夹与 `ARCHIVE-001` 编号均保持在左侧条目列内。
- `npm run build:standalone` 通过，生成的 `Knowra整合UI.html` 已同步最新组件与样式。

### Implementation Checklist

- [x] 改为三只宽体现代档案夹。
- [x] 加入轻微立体顶面和侧面。
- [x] 简化内部细节，降低视觉密度。
- [x] 保留蓝色统一视觉与 `ARCHIVE-001` 编号。
- [x] 调整档案夹与条目标签的未选中/选中状态对比。
- [x] 完成浏览器视觉检查与资料选择交互检查。

final result: passed

---

## 2026-07-22 简洁书籍标记专项 QA

### 比较目标

- Source visual truth：用户要求回归书籍感的状态说明
- Implementation screenshot：`/Users/rabbids/.codex/visualizations/2026/07/20/019f7fee-5b70-7f82-bf6d-84abb5b7b572/14-demo-simplified-books.png`
- Viewport：1280×720
- State：资料索引首条选中，右侧资料详情展开

### Findings

- 未发现 P0、P1 或 P2 问题。
- 图标密度：移除档案夹的标签框、装订环、外侧支撑和厚重底座，仅保留三本简洁书脊、轻微顶部封面层次与一条薄书架线。
- 视觉层级：未选中图标使用 `--muted-soft` 灰线，选中图标切换为 `--blue` 蓝线；普通条目不会与标题、操作入口争夺焦点。
- 语义识别：三本竖直书脊和顶部封面线保留书籍识别度，同时维持 `ARCHIVE-001` 编号作为资料索引装饰信息。

### Implementation Checklist

- [x] 回归简洁书籍形态。
- [x] 删除高密度档案夹细节。
- [x] 保留未选中灰线、选中蓝线的状态逻辑。
- [x] 完成浏览器视觉检查。

final result: passed

---

## 2026-07-22 书籍化档案标记专项 QA

### 比较目标

- Source visual truth：用户要求保留上一版细节完整度，同时将档案样式改成书籍感觉
- Implementation screenshot：`/Users/rabbids/.codex/visualizations/2026/07/20/019f7fee-5b70-7f82-bf6d-84abb5b7b572/16-demo-selection-no-perspective.png`
- Viewport：1280×720
- State：资料索引首条选中，右侧资料详情展开

### Findings

- 未发现 P0、P1 或 P2 问题。
- 形态：保留三本宽体书籍的轻微高低差、封面顶面、侧面和底部薄层板，书脊标签仅作为资料识别细节，不再使用装订环等文件夹语义。
- 密度：比简洁书籍版本增加必要的书脊层次，但移除档案柜式外框和多余内部结构，视觉焦点保持在当前条目。
- 状态：未选中使用灰色线条，选中使用蓝色线条；条目标签仍保持默认灰色、选中或悬停时蓝色。

### Implementation Checklist

- [x] 恢复适中的书籍细节。
- [x] 移除装订环等档案夹特征。
- [x] 保留灰色未选中、蓝色选中的状态逻辑。
- [x] 完成浏览器视觉检查。

final result: passed

---

## 2026-07-22 书籍选中态专项 QA

### 比较目标

- Source visual truth：用户提供的选中态与悬停态对比截图
- Implementation screenshot：`/Users/rabbids/.codex/visualizations/2026/07/20/019f7fee-5b70-7f82-bf6d-84abb5b7b572/15-demo-archive-books.png`
- Viewport：1280×720

### Findings

- 未发现 P0、P1 或 P2 问题。
- 选中态：仅将档案书籍的线条和编号/标签文字切换为 `--blue`，保留未选中态的纸色填充、侧面灰度与透明度，不再透出后方书架线。
- 悬停态：移除标签和编号的 hover 蓝色规则；未点击的条目保持原有灰色状态，仅显示已有的“打开”操作入口。

### Implementation Checklist

- [x] 选中态不再改变书籍填充层和透明度。
- [x] 悬停时标签保持灰色。
- [x] 悬停时编号保持灰色。
- [x] 真正选中后书籍线条、标签和编号变蓝。

final result: passed

---

## 2026-07-23 资料索引三栏与图标统一 QA

### 比较目标

- Source visual truth：用户提供的顶部、左侧栏、右侧栏和资料列表四张问题标注截图。
- Combined comparison：`qa-index-refinement-comparison.png`。
- Implementation screenshots：`qa-index-refinement-1440-final.png`、`qa-index-refinement-1280-final.png`。
- Viewports：1440×1024、1280×800。
- State：资料索引页，首条资料选中，右侧资料详情展开；编辑界面不在本轮范围内。

### Findings

- 未发现 P0、P1 或 P2 问题。
- 顶部：中文主标题与下置英文副标题共用左对齐轴；范围信息改为独立摘要块，“全部资料”在 1280px 下保持完整；新建资料改为内容自适应的 122px 紧凑按钮。
- 左栏：模块 Header 使用与底部知识库入口一致的书本图标；模块切换由 6 个收敛为 5 个，删除重复设置入口；目录 leading 列扩为 40px，文件夹、资料图标与名称之间保持 8px 间距。
- 右栏：顶部改为“资料预览 / 当前资料标题”的主副层级，并与左栏统一为 80px Header；“资料信息、标签、关联笔记、内容大纲、附件”统一为 14px 标题和 18px 图标。
- 列表：旧立体档案图与引用码全部移除，改用轻量书籍组合图标；选中态蓝色、普通态灰色，图标下不再显示编号。
- 响应式：1280px 下页面 `scrollWidth` 与 `innerWidth` 均为 1280，未出现水平溢出；范围标题、新建按钮、列表摘要和右栏标题均未互相覆盖。

### 交互与技术检查

- 搜索“费曼”后列表收敛为 1 条；清除搜索后恢复 3 条。
- 点击“卡片笔记写作法”条目后，列表选中态与右栏副标题同步为同一资料。
- `npm run build:standalone` 通过，独立 `Knowra整合UI.html` 已包含最新图标和布局样式。

### Implementation Checklist

- [x] 重排顶部标题、范围摘要和紧凑创建按钮。
- [x] 统一左栏 Header 与模块切换图标。
- [x] 删除重复设置模块入口。
- [x] 修复目录图标与名称重叠并替换清晰文件图标。
- [x] 重排右栏 Header 并统一左右栏标题字号。
- [x] 用书籍组合图标替换档案图并删除图标编号。
- [x] 完成双视口浏览器检查、核心索引交互检查和同输入视觉对照。

final result: passed

---

## 2026-07-23 大尺寸蓝线图标专项 QA

### 比较目标

- Source visual truth：用户最新确认的“蓝色线条、扁平化、适合大面积展示；列表使用书籍封面”方向。
- Implementation screenshots：`qa-index-line-icons-1440-final.png`、`qa-index-line-icons-1280-final.png`。
- Viewports：1440×1024、1280×900。
- State：资料索引页；编辑界面不在本轮范围内。

### Findings

- 未发现 P0、P1 或 P2 问题。
- 模块图标统一改为 Phosphor `duotone` 蓝线体系：资料库用书册、题库用试卷、AI 工作台用原子、任务用清单、复盘用循环箭头；双色线面结构在 28px 模块入口和 34px Header 中均保持清晰。
- 列表图标改为 70px 单本书封面，以封面边框、书脊、书签和底部书页构成层次；普通态使用低透明蓝线，选中态使用完整主题蓝，未恢复编号。
- 已删除上一轮被否决的拟真位图及其引用；目录小图标和右栏信息图标保持不变。
- 1280px 下页面 `scrollWidth` 与 `innerWidth` 均为 1280，未出现水平溢出。

### 交互与技术检查

- 点击“卡片笔记写作法”后，列表选中态和右栏资料预览同步更新。
- 实测 Header 图标为 34×34px、模块图标为 28×28px、列表书籍为 70×70px，计算颜色均为主题蓝 `rgb(22, 70, 216)`。
- 浏览器控制台无错误，`npm run build:standalone` 通过。

### Implementation Checklist

- [x] 撤回拟真位图方向。
- [x] 使用统一的大尺寸蓝线双色模块图标。
- [x] 将列表标记改为无编号的书籍封面图标。
- [x] 保持目录与右栏小图标不变。
- [x] 完成双视口、交互、尺寸、溢出和控制台检查。

final result: passed

---

## 2026-07-23 右栏 Header 与打开图标专项 QA

### 比较目标与归一化

- Source visual truth：用户问题截图 `qa-inspector-header-source.png`，原始像素 517×182；按约 2× 密度归一为 260×91 CSS px。
- Implementation full view：`qa-index-inspector-header-1440-final.png`，像素与 CSS 视口均为 1440×1024，device scale factor 1。
- Implementation focused region：`qa-index-inspector-header-focus-final.png`，像素与 CSS 尺寸均为 260×80。
- Combined comparison：`qa-index-inspector-header-comparison.png`；左右以同一 260px 栏宽并排呈现。
- Responsive evidence：`qa-index-inspector-header-1280-final.png`，像素与 CSS 视口均为 1280×720，device scale factor 1。
- State：资料索引页，右栏展开，首条资料选中；编辑界面不在本轮范围内。

### Required Fidelity Surfaces

- 字体与层级：将通用的“资料预览”降为 11px 蓝色眉题，把当前资料标题提升为 14px、600 字重的正文主标题，避免通用栏目名压过具体内容。
- 间距与布局：移除 32px 图标方框，改用 28px 开放式书籍图标；标题组与 60×32px 打开按钮在 80px Header 内保持单轴居中。
- 颜色与令牌：Header、列表两处打开图标的计算颜色和填充均为主题蓝 `rgb(22, 70, 216)`，透明度为 1。
- 图标质量：使用 Phosphor `BookOpenText` 双色图标和加粗 `ArrowSquareOut`，未使用位图、手绘 SVG 或字符替代。
- 文案内容：保留“资料预览”“打开”和当前资料标题；信息顺序调整为栏目眉题 → 当前资料。

### Comparison History

- 初始 P2：打开图标因 `fill: none` 覆盖图标库填充而呈浅灰，识别度不足；右栏 Header 同时使用大方框图标、大号通用标题和描边按钮，三个元素视觉权重接近。
- 修复：打开图标改为主题蓝实心填充并提高图标字重；Header 改用无边框开放式书籍图标，倒置标题层级并缩小打开按钮。
- 复查：并排对照中图标、当前资料标题和操作形成清晰的“识别 → 内容 → 行动”顺序；未发现剩余 P0、P1 或 P2 问题。

### 交互与技术检查

- 点击“卡片笔记写作法”后，右栏 Header 标题同步更新为同名资料。
- 1280px 下 `scrollWidth` 与 `innerWidth` 均为 1280，无水平溢出。
- 浏览器控制台无错误，`npm run build:standalone` 通过。

### Implementation Checklist

- [x] 将列表和右栏的打开图标统一为清晰主题蓝。
- [x] 调整右栏 Header 的图标、标题主次和按钮尺寸。
- [x] 完成同栏宽并排视觉对照。
- [x] 完成双视口、选择联动、溢出和控制台检查。

final result: passed

---

## 当前构建门禁

- 当前交付以“2026-07-23 右栏 Header 与打开图标专项 QA”章节为准。
- 最终实现证据：`qa-index-inspector-header-1440-final.png`。
- 右栏对照证据：`qa-index-inspector-header-comparison.png`。
- 1280px 复查证据：`qa-index-inspector-header-1280-final.png`。

final result: passed
