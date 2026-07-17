# Design QA

## Source and implementation

- Frozen source: `docs/前端重构/新UI测试demo/qa-index.png`
- Frozen editor source: `docs/前端重构/新UI测试demo/qa-editor.png`
- Frozen outline source: `docs/前端重构/新UI测试demo/qa-editor-outline.png`
- Production index: `docs/前端重构/qa-production-index.png`
- Production editor: `docs/前端重构/qa-production-editor.png`
- Round 2 index: `docs/前端重构/audit-round2-after-index.jpg`
- Round 2 filter menu: `docs/前端重构/audit-round2-after-filters.jpg`
- Round 2 search: `docs/前端重构/audit-round2-after-search.jpg`
- Round 2 editor blocks: `docs/前端重构/audit-round2-after-quote.jpg`
- Round 2 source editor: `docs/前端重构/audit-round2-after-source-editor.jpg`
- Round 3 source/browser comparison: `docs/前端重构/qa-round3-comparison.png`
- Round 3 index: `docs/前端重构/qa-round3-index.png`
- Round 3 editor: `docs/前端重构/qa-round3-editor.png`
- Round 3 section menu: `docs/前端重构/audit-round3-after-section-menu.png`
- Round 3 tree context menu: `docs/前端重构/audit-round3-after-context-menu.png`
- Round 3 editor context menu: `docs/前端重构/audit-round3-after-editor-context-menu.png`
- Round 4 focused source/implementation comparison: `docs/前端重构/qa-round4-comparison.png`
- Round 4 index: `docs/前端重构/qa-round4-index-top.png`
- Round 4 pagination: `docs/前端重构/qa-round4-index.png`
- Round 4 editor: `docs/前端重构/qa-round4-editor.png`
- Round 4 active menu: `docs/前端重构/qa-round4-editor-menu.png`
- Round 4 attachment/status: `docs/前端重构/qa-round4-attachment.png`
- Runtime: `http://localhost:3007/`

## States and viewports checked

- 1440×1024: real-data library index, selected-item inspector, editor information tab, editor outline tab.
- 1280×800: index and editor layouts, right sidebar collapse/reopen, horizontal overflow.
- Data state: existing local-first workspace data; no Demo fixture was injected into production.
- Round 3: 1280×720 real browser viewport, full index, active filters, compact tabs, code block input, stale annotation recovery and all shared menu surfaces.
- Round 4: 1280×720 real browser viewport, 5/10/20/50 page capacities, true page slicing, active file menu, quick-format actions, tag add/remove, narrow inspector, attachment disclosure and expanded status bar.

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

## Result

final result: passed
