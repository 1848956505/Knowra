# Design QA

## Source and implementation

- Frozen source: `docs/前端重构/新UI测试demo/qa-index.png`
- Frozen editor source: `docs/前端重构/新UI测试demo/qa-editor.png`
- Frozen outline source: `docs/前端重构/新UI测试demo/qa-editor-outline.png`
- Round 4 focused source/implementation comparison: `docs/前端重构/qa-round4-comparison.png`
- Round 4 index: `docs/前端重构/qa-round4-index-top.png`
- Round 4 pagination: `docs/前端重构/qa-round4-index.png`
- Round 4 editor: `docs/前端重构/qa-round4-editor.png`
- Round 4 active menu: `docs/前端重构/qa-round4-editor-menu.png`
- Round 4 attachment/status: `docs/前端重构/qa-round4-attachment.png`
- 本轮任务的内联新建行参考：`/Users/rabbids/Library/Application Support/typora-user-images/image-20260717222515433.png`
- 本轮任务的标题/正文参考：`/Users/rabbids/Library/Application Support/typora-user-images/image-20260717222655702.png`
- 本轮内联新建行实现：`docs/前端重构/任务验收/qa-task-inline-implementation.png`
- 本轮标题/正文实现：`docs/前端重构/任务验收/qa-task-title-implementation.png`
- 本轮标签溢出实现：`docs/前端重构/任务验收/qa-task-tabs-overflow.png`
- 本轮同输入视觉对照：`docs/前端重构/任务验收/qa-task-inline-comparison.png`、`docs/前端重构/任务验收/qa-task-title-comparison.png`
- Runtime: `http://localhost:3007/`

## States and viewports checked

- 1440×1024: real-data library index, selected-item inspector, editor information tab, editor outline tab.
- 1280×800: index and editor layouts, right sidebar collapse/reopen, horizontal overflow.
- Data state: existing local-first workspace data; no Demo fixture was injected into production.
- Round 3: 1280×720 real browser viewport, full index, active filters, compact tabs, code block input, stale annotation recovery and all shared menu surfaces.
- Round 4: 1280×720 real browser viewport, 5/10/20/50 page capacities, true page slicing, active file menu, quick-format actions, tag add/remove, narrow inspector, attachment disclosure and expanded status bar.
- 本轮：1280×720 真实浏览器视口，验证目录内联新建行、独立可编辑资料标题、正文首个标题、九个打开标签的溢出菜单及隐藏标签切换。

## Visual comparison

- Layout: the production shell preserves the frozen three-column grid, editorial paper background, fixed left navigation and structured right inspector/marginalia.
- Typography: condensed display numerals, blue editorial headings and restrained body hierarchy remain consistent with the Demo.
- Color: the primary blue, lime status accent, warm paper surface and neutral rules use the same visual system.
- Spacing: index rows, document header, sidebar sections and tab rules follow the frozen rhythm while accommodating real content lengths.
- Components: tags reuse one blue-outline style in the index, document header and marginalia; section headings reuse one icon/title treatment.
- Copy and icons: production copy reflects real functions; icons are centralized and consistent with the existing UI icon language.
- Legibility: auxiliary copy increased by 1–2px without changing the 16px reading baseline; right metadata and tree labels remain readable at 1280px.
- Round 3 menus: navigation, tree, tab and editor context menus now share the same square paper panel, blue rule and selected/hover behavior.
- Round 4 density: the right inspector matches the 260px navigation rail; attachment metadata reflows into two rows instead of compressing the filename into legacy pill controls.
- Round 4 controls: page capacity, menu active states, referenced attachment state and status actions use square blue states from the production token system.
- Round 4 focused comparison found no blocking hierarchy, spacing, color, control-state or overflow mismatch. The deliberately narrower production attachment panel preserves the reference hierarchy while fitting the requested rail width.
- 本轮内联行将原先较松散的输入/符号操作收为左侧蓝线、文件图标、单行输入与“保存/取消”两枚语义化操作；在不改变新 UI 直角、蓝色强调原则的前提下，层级和可读性更明确。
- 本轮标题/正文同输入对照确认：资料标题只在随正文滚动的文档头出现；正文的第一个标题保留其原有语义，不再被用作或重复为资料标题。
- 本轮多标签对照确认：标签栏与工具栏同为 35px 高，编辑区不因长标题或多标签横向扩张；隐藏标签收纳到右侧“••• + 数量”菜单。
- Intentional differences: counts, titles, dates and tags come from real project data; unavailable modules remain explicit placeholders.

## Interaction checks

- Library scope, folder selection, search, index tab switching, note selection and double-click/open behavior.
- Type, status and time filter menus, empty result, one-click filter reset and recent-five range.
- New note, recycle-bin restore entry, brand home and editor back navigation.
- Existing editor tabs, file menu, quick-format commands, Milkdown host and note switching.
- Shared document-head/body scrolling, focus without full-editor outline, quote/inline-code/code-block styling and source-preview layout.
- Marginalia information, outline, highlights and AI tabs.
- Right sidebar collapse and reopen behavior.
- No horizontal overflow at 1440px or 1280px.
- Code blocks accept a real click-to-caret, text input and undo sequence in the browser.
- Stale active annotations whose quote has already been deleted no longer throw during editor transactions.
- Page capacity changes to 5/10/20/50 notes, clamps the active page and preserves global entry numbering across pages.
- File-menu commands and H1/H2/H3, bold, italic, list, quote and inline-code quick actions respond from the toolbar without event-bubbling loss.
- Marginalia tags open, accept input, add existing tags and remove them; the browser verification restored the original tag state afterward.
- Attachment disclosure, open action, source toggle and marginalia toggle remain interactive at the narrowed 260px inspector width.
- Status bar exposes save state, current note, note/folder counts, readable words, lines, outline count, links, source/marginalia controls, encoding and connection state.
- 目录右键新建文件：输入行显示、取消后无临时数据残留。
- 文档标题：输入临时标题后按 Escape 恢复原标题；正文首个标题保持“第一遍：”，未出现与资料标题重复的 H1。
- 多标签：打开 9 份资料后出现隐藏标签入口；菜单展开、选中隐藏的 Vision Transformer 后，菜单收起且对应标签/文档头正确切换。
- 浏览器控制台错误日志复核：本轮交互未发现应用错误。

## Comparison history

1. Initial production editor comparison exposed a duplicated Markdown H1 beneath the document metadata title and omitted the Demo's quick-format group.
2. The duplicate first H1 is now visually suppressed when the document title is already presented in the metadata header.
3. The quick-format group now reuses the existing formatting commands for H1/H2/H3, bold, italic, unordered list, quote and inline code.
4. Post-fix DOM verification confirmed eight quick-format actions and the hidden duplicate title while retaining the editable Milkdown document.
5. Round 2 removed the unmatched “我创建的” scope, activated all three index filters and replaced decorative A1/B1 codes with estimated reading time.
6. A browser regression exposed that the first click redraw removed the DOM node before the second click; single-click preview is now delayed briefly so double-click opens reliably.
7. Source-preview inspection exposed old pill-shaped TOC links and a missing `formatDate` dependency; the TOC now uses the editorial rule system and source save status renders without runtime errors.
8. Round 3 browser comparison exposed undersized auxiliary copy, unbounded filter SVGs, thin module numerals, oversized document tabs and legacy rounded context menus; all now use the production token system.
9. The `child.nodeSize` error was reproduced against an active annotation whose saved range exceeded the shortened note. Range validation now prevents the invalid `textBetween` call and a dedicated regression test covers deleted quotes.
10. Code block input was reproduced as a failed click-to-selection. The repaired editor now places the caret inside `CODE`, accepts input and restores the original content through undo.
11. Round 4 exposed decorative pagination that rendered every note. Rendering now slices filtered notes, provides 5/10/20/50 capacities and retains meaningful global sequence numbers.
12. Toolbar commands were present but blocked by the menu bar's propagation boundary. The menu bar now dispatches shared format commands directly, and bold content renders with the stronger blue editorial weight.
13. The tag composer used three conflicting data attributes and had lost its click branches. Its input, add, remove and create flows now share one event contract with regression coverage.
14. The first narrow attachment pass still compressed the filename beside its badge. The final pass moves the badge below metadata, keeps the open action aligned, and exposes the complete filename as a title.
15. Same-input comparison of the supplied toolbar and attachment references against the final browser screenshots confirmed the requested blue square active state, restrained rules and readable narrowed layout. No P0, P1 or P2 visual issue remains.
16. 本轮初次浏览器验证发现运行中的本地开发服务仍在使用旧的服务端壳模板，缺少隐藏标签菜单容器；重启本地开发服务后，菜单渲染、选择与自动收起均正常。
17. 本轮以两张任务参考图和两张真实浏览器截图做同输入对照：内联新建行改为语义化的“保存/取消”操作；旧手动笔记的冗余首个 H1 在加载时仅限同名情形下迁移移除，避免重复标题且不影响正文首标题。
18. 本轮视觉与交互验收未发现 P0、P1 或 P2 问题；资料卡上的“001”等全局序号按任务要求未改动，留待产品确认其语义后单独处理。

## 2026-07-23 正式资料索引 Header 同步

### Source and implementation

- Source visual truth：`docs/前端重构/新UI测试demo/qa-index-inspector-header-focus-final.png`，260×80 像素，CSS 尺寸 260×80，device scale factor 1。
- Implementation focused region：`docs/前端重构/正式前端资料索引Header-focus-final.png`，260×80 像素，CSS 尺寸 260×80，device scale factor 1。
- Full-view implementation：`docs/前端重构/正式前端资料索引Header-1440-final.png`，1440×1024 像素，对应 1440×1024 CSS 视口。
- Responsive implementation：`docs/前端重构/正式前端资料索引Header-1280-final.png`，1280×720 像素，对应 1280×720 CSS 视口。
- Combined comparison：`docs/前端重构/正式前端资料索引Header-comparison.png`，按相同 260px 栏宽并排比较。
- State：真实本地数据，资料索引页，多模态目录，右栏展开，当前资料为 CLIP；未注入 Demo 数据。

### Required fidelity surfaces

- 字体与层级：正式前端与确认稿均使用 11px 蓝色“资料预览”眉题、14px/600 当前资料主标题；标题截断和光学权重一致。
- 间距与布局：28px 开放式书籍图标、8px 图标—标题间距、60×32px 打开按钮和 80px Header 均与确认稿一致。
- 颜色与令牌：书籍图标和两处打开图标均使用主题蓝 `#1646d8`；按钮、蓝色底线、纸张背景复用正式令牌。
- 图标与资产质量：复用官方 Phosphor `BookOpenText` duotone 与 `ArrowSquareOut` bold SVG 资产；静态服务以 `image/svg+xml` 返回，浏览器实测 `complete: true` 且 natural width 正确。
- 文案内容：保留“资料预览”“打开”和真实资料标题；正式数据差异属于预期。

### Interaction and responsive checks

- 单击 Vision Transforme 条目后，右栏 Header 标题同步更新。
- 点击右栏“打开”进入该资料编辑器；点击编辑区返回入口后恢复资料索引。
- 1280×720 下 `scrollWidth` 与 `innerWidth` 均为 1280，没有水平溢出。
- 图标实测尺寸：Header 书籍 28×28px、右栏打开 16×16px、列表打开 14×14px；透明度均为 1。
- 浏览器控制台无应用错误；Web 全量测试 117/117 通过。

### Comparison history

1. 首次同尺寸并排比较中，正式前端的图标、标题主次、按钮尺寸、底线和纸张背景均与已确认 Demo 对齐。
2. 未发现需要继续修复的 P0、P1 或 P2 问题；真实资料标题长度差异不会改变 Header 布局。

### Implementation checklist

- [x] 正式列表和右栏打开图标改为清晰主题蓝。
- [x] 正式右栏 Header 同步开放式书籍图标和栏目—内容—操作层级。
- [x] 新增可复用 Phosphor SVG 资产及正确 MIME。
- [x] 完成双视口、选择联动、打开/返回、溢出和控制台检查。

final result: passed

## Result

final result: passed

## 2026-07-30 Phase3.1 工作域布局修复 QA

### Comparison target

- Source visual truth: `/var/folders/pb/fc84ns390y39c478dnyv74fm0000gn/T/codex-clipboard-5638982e-f8d3-4c2c-a108-b81f01b691bb.png`（知识工作域故障截图）；`/var/folders/pb/fc84ns390y39c478dnyv74fm0000gn/T/codex-clipboard-7f3bb54d-6be6-4e4f-a935-9ac856b161cb.png`（训练工作域故障截图）。
- Rendered implementation: `/private/tmp/knowra-phase31-knowledge-fixed.png`、`/private/tmp/knowra-phase31-training-fixed.png`、`/private/tmp/knowra-phase31-learning-fixed.png`。
- Browser viewport: `1280 x 720 CSS px`; implementation screenshots are `1280 x 720 px`.
- Source screenshots are `2558 x 1289` and `2560 x 1289 px`; they were treated as approximately `2x` captures and compared by layout proportions.
- State: local API/Web development servers; knowledge overview, training overview and learning archive dependency-gate states.

### Comparison evidence

The source and fixed captures were reviewed together at the same work-domain states. The source showed the domain content constrained to roughly the left 260px track, with the rest of the viewport blank and no usable global work-domain navigation. The fixed captures show the global Rail retained at 260px and the domain shell occupying the remaining viewport, with readable headers, tabs, metrics, lists and dependency-gate content.

Focused checks covered the outer Grid track, global Rail, work-domain header/nav, dashboard columns, status bar and return-to-materials path. No additional crop was needed because the blocking defect affected the full viewport composition.

### Findings and iteration history

#### Iteration 1 — blocked

- `[P0]` Non-material work domains were unusable. `shell-controller.js` hid the entire `knowra-rail`, while the outer Grid still retained its 260px first track. The work-domain main area was consequently rendered inside that narrow track and the user lost the global navigation.
- Fix: keep the global Rail visible whenever `activeWorkDomain` is not `materials`; let the domain main area occupy the remaining Grid track. Added a controller regression test for this invariant.

#### Iteration 2 — passed

- Knowledge overview, knowledge list/inspector, training overview, question library/editor entry and learning archive gate were captured after the fix.
- The global Rail remains clickable, the main area no longer clips at 260px, and the Materials entry returns to the existing library index.
- Browser console check: no warnings or errors.

### Required fidelity surfaces

- Fonts and typography: existing Swiss Editorial Grid tokens and current display/body font stack remain unchanged; headings, labels and body copy render without the source truncation caused by the broken width.
- Spacing and layout rhythm: the 260px Rail is retained as the global navigation column; the work-domain shell now fills the remaining width, and dashboard/list/inspector columns are visible.
- Colors and visual tokens: no new colors or gradients; existing ivory, cobalt, rule-line and status tokens remain in use.
- Image quality and asset fidelity: existing Rail icon assets are retained; no replacement imagery or CSS-drawn assets were introduced.
- Copy and content: existing Chinese work-domain labels and dependency-gate copy are unchanged.

### Primary interactions tested

- Switch Materials → Knowledge → Training → Learning Archive.
- Switch Knowledge overview → Knowledge Items; select a KnowledgeItem and open its inspector.
- Switch Training overview → Question Library → Question Editor entry.
- Return from a non-material work domain to Materials.

### Implementation checklist

- [x] Restore usable work-domain width.
- [x] Keep global work-domain navigation available outside Materials.
- [x] Add shell-controller regression coverage.
- [x] Verify knowledge, training and learning states in the browser.
- [x] Verify no browser console warnings/errors.

final result: passed

## 2026-08-02 印格资料库索引页左侧导航收窄 QA

### Source and implementation

- Source visual truth: `/var/folders/pb/fc84ns390y39c478dnyv74fm0000gn/T/codex-clipboard-2bff6928-748e-4951-ad7c-9ec03fcbb92d.png`（174×135 PNG，左侧导航图标/标题局部参考）。
- Implementation screenshot: `/private/tmp/knowra-index-implementation-sidebar-208.png`（1280×720，对应 1280×720 CSS 视口，device scale factor 1）。
- State: 左侧导航收窄为 208px；目录栏和资料详情栏保持 232px 并展开。

### Comparison evidence

- 左侧导航实际宽度为 `208px`，品牌区宽度随变量同步为 `184px`。
- 导航项目均保持单行显示，没有文字截断；目录栏和详情栏仍为 `232px`，标题栏没有被挤压。
- 页面 `scrollWidth` 与 `clientWidth` 均为 `1280px`，没有横向溢出；主内容区获得额外 24px 空间。

### Interaction checks

- 目录栏折叠后展开按钮位于 `x = 206`，尺寸保持 `28 × 28px`；点击展开后目录恢复显示。
- 浏览器控制台错误/警告：`0`。

### Findings

- 无可执行的 P0/P1/P2 问题。

final result: passed

## 2026-08-02 印格资料库索引页侧栏头部 QA

### Source and implementation

- Source visual truth: `/var/folders/pb/fc84ns390y39c478dnyv74fm0000gn/T/codex-clipboard-2bff6928-748e-4951-ad7c-9ec03fcbb92d.png`（174×135 PNG，左侧导航图标/标题局部参考）。
- Implementation screenshot: `/private/tmp/knowra-index-implementation-default.png`（1280×720 JPEG，对应 1280×720 CSS 视口，device scale factor 1）。
- State: 目录栏和资料详情栏均展开；另行测试了两侧折叠/展开状态。
- Density normalization: 未做缩放；源图是局部参考，实施截图是完整页面，因此采用聚焦区域比对，不做整图像素对齐。

### Comparison evidence

- 目录栏与详情栏均从 `y = 60` 开始，头部高度均为 `52px`，下边界均为 `2px solid #1A1A1A`。
- 两个侧栏宽度均为 `232px`。
- 目录标题为“资料目录”，详情标题为“资料详情”；图标均为 16px Remix Icon 线性图标，图标—标题间距与左侧导航一致，详情标题保持单行。
- 两个折叠控件均为 `28 × 28px` 方形按钮，保留硬阴影、悬停和按压反馈。

### Interaction checks

- 目录栏折叠/展开：`catalog-collapse` → `catalog-expand`，目录的 `display` 在 `none` / `flex` 间正确切换。
- 详情栏折叠/展开：`inspector-collapse` → `inspector-expand`，详情的 `display` 在 `none` / `flex` 间正确切换。
- 浏览器控制台错误/警告：`0`。

### Comparison history

1. 初次比对发现详情标题在 232px 侧栏宽度下被“打开”和折叠按钮挤成两行。
2. 修复为标题不换行、详情“打开”按钮收紧内边距，并锁定方形折叠按钮不收缩。
3. 复核后标题保持单行，P0/P1/P2 问题为 0。

### Required fidelity surfaces

- Fonts and typography: 标题、图标尺寸和字重统一，标题不换行。
- Spacing and layout rhythm: 两侧标题栏顶部、宽度、高度和边界线一致。
- Colors and visual tokens: 复用现有纸张背景、黑色硬边界、蓝色强调和硬阴影令牌。
- Image quality and asset fidelity: 复用 Remix Icon 字体图标，没有新增 CSS 绘图或占位资产。
- Copy and content: 目录标题改为“资料目录”，详情标题保留为“资料详情”。

### Findings

- 无可执行的 P0/P1/P2 问题。

final result: passed

## 2026-08-02 印格资料库索引页线条层级方案 QA

### Source and implementation

- Source visual truth: `/var/folders/pb/fc84ns390y39c478dnyv74fm0000gn/T/codex-clipboard-d391c672-7f64-4e0d-b861-fc119dcc4c5c.png`（截图标注了外壳边界、功能页内部结构线和顶部轻分隔线）。
- Implementation screenshot: 本轮浏览器访问本地页面被安全策略拒绝，未生成新的实施截图。
- Intended viewport: `1280 x 720 CSS px`；当前仅完成静态 CSS/HTML 检查，未将本轮视觉结果标记为通过。
- State: 索引页默认展开态；组件库未同步。

### Proposed hierarchy and static evidence

- Level 1 shell line: `2px solid var(--ink-line-shell)`，已应用于顶部栏底线和左侧导航右边界。
- Level 2 functional structure line: `2px solid var(--ink-line-panel)` 或 `1px solid var(--ink-line-panel)`，当前值为 `#B8B4AC`，已应用于目录栏/详情栏外侧边界、两侧标题栏底线和视图 Tab 底线。
- Level 3 soft divider: `1px solid var(--ink-line-soft)`，当前值为 `#E5E1DA`，已应用于顶部用户操作区分隔线，并作为现有列表行/详情分组轻线的语义令牌。
- 操作按钮、卡片和输入框的黑色边框暂时保留，作为可点击控件的 affordance，不与页面结构线混用。
- 静态检查确认三级令牌、目标选择器和 HTML 结构均存在；`git diff --check` 通过。

### Findings

- `[P2]` 浏览器视觉复核受阻：本地页面访问被浏览器安全策略拒绝，无法完成截图、真实渲染和控制台检查。
  - Blocker: 当前浏览器会话拒绝访问 `http://127.0.0.1:4173`。
  - Next step: 需要重新开放本地预览访问后，再在同一视口完成视觉对照并决定是否微调。

final result: blocked

## 2026-08-03 印格编辑器页资料边注辅助侧栏 QA

### Source and implementation

- Source of truth: `docs/前端重构/印格设计系统-组件库.html` 的可折叠辅助侧栏演示及 `docs/前端重构/印格-资料库索引页.html` 的资料详情栏。
- Implementation target: `docs/前端重构/印格-编辑器页.html`。
- State: 资料边注保留信息 / 大纲 / 重点 / AI 内容，外观和折叠交互改为统一辅助侧栏。

### Static evidence

- 侧栏宽度：`232px`；头部高度：`52px`；折叠按钮：`28 × 28px` 方块按钮。
- 侧栏头部使用资料图标 + “资料边注”标题，头部下边界使用 `1px #E5E2DC`。
- 侧栏外侧边界使用 `1px #E5E2DC`，内容分组使用 `1px #F0EEE9`。
- 折叠后保留右缘展开按钮；底部“边注”开关与头部按钮同步 `aria-expanded` / `aria-hidden` 状态。
- `npm run test:web` 通过（131 passed, 0 failed）；`git diff --check` 通过。

### Findings

- `[P2]` 浏览器视觉复核受阻：当前浏览器会话仍拒绝访问本地页面，未生成本轮实施截图和控制台结果。

final result: blocked

## 2026-08-03 印格资料库索引页外壳线 1px QA

### Source and implementation

- Source visual truth: `/var/folders/pb/fc84ns390y39c478dnyv74fm0000gn/T/codex-clipboard-67d91152-84d4-4af6-8520-64da4a92867d.png`（Codex 顶部栏与侧栏的轻量分隔参考）。
- Implementation screenshot: 本轮浏览器访问本地页面仍被安全策略拒绝，未生成新的实施截图。
- State: 索引页默认展开态；组件库未同步。

### Proposed hierarchy and static evidence

- Level 1 shell line: 保留 `#1A1A1A` 深黑色，顶部栏底线和左侧导航右边界调整为 `1px solid var(--ink-line-shell)`。
- Level 2 functional structure line: 保持 `1px solid #E5E2DC`。
- Level 3 soft divider: 保持 `1px solid #F0EEE9`。
- 静态检查确认目标选择器和 HTML 结构均存在；`git diff --check` 通过。

### Findings

- `[P2]` 浏览器视觉复核受阻：本地页面访问被浏览器安全策略拒绝，无法完成截图、真实渲染和控制台检查。

final result: blocked

## 2026-08-02 印格资料库索引页 Codex 式轻量线条 QA

### Source and implementation

- Source visual truth: `/var/folders/pb/fc84ns390y39c478dnyv74fm0000gn/T/codex-clipboard-67d91152-84d4-4af6-8520-64da4a92867d.png`（Codex 顶部栏、侧栏和标签页之间的低对比度分隔线参考）。
- Implementation screenshot: 本轮浏览器访问本地页面仍被安全策略拒绝，未生成新的实施截图。
- Intended viewport: `1280 x 720 CSS px`；当前仅完成静态 CSS/HTML 检查，未将本轮视觉结果标记为通过。
- State: 索引页默认展开态；组件库未同步。

### Proposed hierarchy and static evidence

- Level 1 shell line: 恢复为原有 `2px solid #1A1A1A`，应用于顶部栏底线和左侧导航右边界；外壳线的颜色与尺寸保持原方案。
- Level 2 functional structure line: 调整为 `1px solid #E5E2DC`，应用于目录栏/详情栏外侧边界、侧栏标题栏底线和视图 Tab 底线。
- Level 3 soft divider: 调整为 `1px solid #F0EEE9`，应用于顶部用户操作区分隔线及列表/详情分组轻线。
- 操作按钮、卡片、输入框和选中态指示器的黑色边框暂时保留，继续承担交互识别或状态表达，不作为页面结构线。
- 静态检查确认三级令牌、目标选择器和 HTML 结构均存在；`git diff --check` 通过。

### Findings

- `[P2]` 浏览器视觉复核受阻：本地页面访问被浏览器安全策略拒绝，无法完成截图、真实渲染和控制台检查。
  - Blocker: 当前浏览器会话拒绝访问 `http://127.0.0.1:4173`。
  - Next step: 需要重新开放本地预览访问后，再在同一视口完成视觉对照并决定是否微调。

final result: blocked

## 2026-08-03 印格资料库索引页线条系统定稿与组件库同步 QA

### Source and implementation

- Source visual truth: `/var/folders/pb/fc84ns390y39c478dnyv74fm0000gn/T/codex-clipboard-67d91152-84d4-4af6-8520-64da4a92867d.png`（Codex 低对比度分隔线参考）及本轮用户确认的外壳线 2px 决策。
- Implementation targets: `docs/前端重构/印格-资料库索引页.html`、`docs/前端重构/印格设计系统-组件库.html`、`docs/前端重构/Knowra UI 风格设计文档.md`。
- State: 索引页外壳线恢复为 2px；组件库已同步线条令牌和可折叠辅助侧栏演示；组件库演示包含折叠/展开交互。

### Static evidence

- Level 1 shell line: `2px solid #1A1A1A`，应用于索引页顶部栏底线和左侧导航右边界。
- Level 2 functional structure line: `1px solid #E5E2DC`。
- Level 3 soft divider: `1px solid #F0EEE9`。
- 辅助侧栏演示规格：`232px` 默认宽度、`52px` 头部、`28 × 28px` 方块按钮；折叠态保留按钮作为重新打开入口。
- `git diff --check` 通过；组件库页面脚本包含 `aria-expanded` / `aria-hidden` 状态同步。

### Findings

- `[P2]` 浏览器视觉复核受阻：当前浏览器会话仍拒绝访问本地页面，未能生成本轮实施截图和控制台结果。

final result: blocked

## 2026-08-03 印格编辑器页外壳同步 QA

### Source and implementation

- Source of truth: `docs/前端重构/印格-资料库索引页.html` 的顶栏与左侧导航外壳。
- Implementation target: `docs/前端重构/印格-编辑器页.html`。
- State: 编辑器保留自己的文档树、编辑区与边注内容；顶栏和左侧导航外壳已同步，边注边界按辅助侧栏线条规则调整。

### Static evidence

- 顶栏：60px 高、24px 水平内边距、居中搜索框、通知/设置/用户中心操作区及 1px 浅色短分隔线。
- 左侧导航：宽度 `208px`、右边界 `2px solid #1A1A1A`，导航内边距和图标/标题间距与索引页一致。
- 边注辅助侧栏：外侧边界 `1px solid #E5E2DC`，头部下边界同级，内容分组使用 `1px #F0EEE9`。
- 编辑器页脚注已更新为批次 10；编辑器脚本静态结构未改变。
- `git diff --check` 通过。

### Findings

- `[P2]` 浏览器视觉复核受阻：当前浏览器会话仍拒绝访问本地页面，未生成本轮实施截图和控制台结果。

final result: blocked
