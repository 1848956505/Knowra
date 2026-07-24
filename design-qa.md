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
