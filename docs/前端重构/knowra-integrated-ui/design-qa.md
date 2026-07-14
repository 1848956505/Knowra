# Design QA

- Source visual truth:
  - `/Users/rabbids/Documents/Codex/知境·Knowra/docs/前端重构/工作台（首页）.png`
  - `/Users/rabbids/Documents/Codex/知境·Knowra/docs/前端重构/资料库.png`
  - `/Users/rabbids/Documents/Codex/知境·Knowra/docs/前端重构/原始稿/knowra-swiss-grid/`
- Implementation screenshots:
  - `/Users/rabbids/Documents/Codex/知境·Knowra/docs/前端重构/knowra-integrated-ui/qa-index.png`
  - `/Users/rabbids/Documents/Codex/知境·Knowra/docs/前端重构/knowra-integrated-ui/qa-editor.png`
- Combined comparison evidence:
  - `/Users/rabbids/Documents/Codex/知境·Knowra/docs/前端重构/knowra-integrated-ui/qa-compare-index.png`
  - `/Users/rabbids/Documents/Codex/知境·Knowra/docs/前端重构/knowra-integrated-ui/qa-compare-editor.png`
- Viewport: `1440 × 1024`
- States: knowledge index; document editor with marginalia open

## Findings

- No remaining P0/P1/P2 mismatch.
- Typography: the implementation retains the reference hierarchy of bold Chinese display headings, condensed numeric indices and small editorial metadata. `Noto Sans SC` and `Archivo Narrow` provide matching web-safe equivalents, with local Chinese sans-serif fallbacks.
- Spacing and layout rhythm: the three-column index and editor compositions preserve the reference rail, main workspace and contextual inspector proportions. One-pixel rules, square controls and continuous surfaces match the source grid language.
- Colors and tokens: ivory `#f5f3ec`, near-black `#161616`, cobalt `#1646d8`, neutral rules and fluorescent status dots map directly to the source palette.
- Image and asset fidelity: the target contains no photography or illustration. UI icons use the Phosphor library; no placeholder, emoji or hand-drawn SVG asset substitutes are present.
- Copy and content: visible content follows the reference knowledge-management examples and uses current Knowra naming. The index inspector action is intentionally “打开资料” so it performs the selected-item action rather than duplicating the global “新建资料” action.

## Focused comparison

- Index focus: masthead, large numbered rows, selected blue rule, filters, tags and inspector density were readable in the combined index comparison.
- Editor focus: document tab strip, numbered title block, toolbar, paragraph grid, citations and marginalia were readable in the combined editor comparison.
- The source editor’s temporary link-insertion popover is not shown in the default implementation screenshot because it represents a transient command state rather than the default editor state.

## Comparison history

### Pass 1

- [P2] The editor toolbar rendered duplicate `H1/H2/H3` labels because both an icon and text were present.
- [P2] Four document tabs competed with the search/new/settings actions and clipped the fourth title.
- [P2] Backlink titles could push their codes toward the inspector edge.

Fixes:

- Replaced heading icon-plus-text controls with concise text-only heading controls.
- Made document tabs flex within the available track, constrained their width and kept top actions non-shrinking.
- Allowed backlink titles to shrink and wrap while reserving space for codes.

Post-fix evidence:

- `qa-editor.png` shows the corrected single-label toolbar, contained tab strip and readable marginalia.
- Page console contained no error or warning entries.

## Primary interactions tested

- Open a knowledge entry and enter the editor.
- Search the index and reduce the visible result set to one item.
- Open and close the new-material dialog.
- Collapse the index inspector and reveal its restore control.
- Switch from the editor back to the index.

## Follow-up polish

- [P3] A future iteration can add the reference editor’s contextual knowledge-link insertion popover.
- [P3] Font rendering can vary slightly while Google Fonts are unavailable; local fallbacks preserve the hierarchy.

final result: passed

