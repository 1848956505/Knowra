# Botanical Herbarium UI Demo Design

## Goal

Create an independent static HTML demo for the Study Accelerator knowledge-base note page.
The demo should explore a memorable "botanical garden" UI direction without referencing the
existing theme demos in `apps/web/styles/UI主题`.

The selected direction is **Botanical Herbarium / Formal Archive**: a knowledge workspace that
feels like a plant specimen archive, with catalog numbers, paper surfaces, pressed borders,
deep botanical green, brass index accents, and herbarium-style tags.

## Scope

- Build a standalone static HTML demo that can be opened directly in a browser.
- Represent the current note-taking / knowledge-base page as a polished visual prototype.
- Keep the demo static. Controls may have hover states, but no full interaction model is required.
- Use realistic knowledge-base content, including note title, folders, open tabs, tags, references,
  outline items, metadata, and status information.
- Do not modify the running product UI in this design pass.

## Non-Goals

- Do not reuse the visual language of existing theme demos.
- Do not build a new app route or wire demo state into the production client.
- Do not create a marketing landing page.
- Do not make the theme feel like a scrapbook, hand journal, or generic green dashboard.

## Page Model

The static demo should preserve the recognizable knowledge-base workspace structure:

- A narrow global rail for major modules and identity.
- A left archive/catalog panel for folders, collections, and note lists.
- A central note surface with tabs, compact formatting tools, and long-form note content.
- A right specimen metadata rail with tags, references, outline, and note properties.
- A top search/action bar.
- A bottom status strip with save state, location, theme label, and document statistics.

## Visual Direction

The core metaphor is a formal plant specimen archive.

The UI should feel like a working archive desk rather than a decorative botanical poster:

- The left navigation behaves visually like a catalog cabinet or archive index.
- The active note feels like a specimen sheet mounted on a quiet paper surface.
- Tags and metadata feel like museum labels or specimen slips.
- The top and bottom bars should feel like archival instruments, not colorful app chrome.
- Deep green should be used for identity, selection, and structural anchors.

## Palette

Use a restrained botanical archive palette:

- Deep botanical green: primary identity, active states, rail spine.
- Ink green-black: main text and serious controls.
- Specimen paper ivory: editor and panel surfaces.
- Warm archive beige: background, paper shadows, inactive panels.
- Brass ochre: numbering, catalog marks, small emphasis.
- Moss gray-green: secondary panels and muted tags.
- Faded red-brown may be used sparingly for archive stamps or warning-like metadata.

Avoid one-note green dominance. The page should read as green-led but balanced by paper,
brass, ink, and muted neutral surfaces.

## Typography

- Use a serif display face for note titles, archive labels, and specimen headings.
- Use a clean sans-serif face for controls, navigation, and dense UI labels.
- Use a monospace face for catalog numbers, timestamps, counts, and status metadata.
- Keep text practical and compact inside tool surfaces.
- Avoid oversized hero typography because this is a workspace demo, not a landing page.

## Signature Motifs

The demo should include several recurring visual motifs:

- Vertical catalog spine: a narrow dark-green column with rotated archive text.
- Specimen numbers: `HB-042`, `FOLIO-17`, or similar identifiers in mono text.
- Pressed paper borders: subtle double borders and inner rules.
- Label slips: compact rectangular tags with small metadata and botanical classification.
- Cabinet index tabs: small side tabs or top tabs that look like archive dividers.
- Mounted note sheet: the central document has a specimen-sheet feel without becoming ornate.

## Layout Rules

- Keep the layout dense but readable.
- Avoid nested cards. Use panels, bands, rails, and repeated list items instead.
- Use stable dimensions for rails, toolbars, tabs, buttons, and status areas.
- The central note area should remain the most visually calm region.
- Side panels should support scanning and classification, not compete with the note.
- The demo should fit desktop first and remain coherent on narrower widths.

## Component Language

The static demo should show a complete UI vocabulary:

- Global rail buttons with active/inactive states.
- Search field with archive-style framing.
- Primary and secondary action buttons.
- Folder / collection tree with selected item.
- Note list rows with catalog IDs, dates, and tag chips.
- Open note tabs with active tab.
- Compact formatting toolbar.
- Editor sheet with headings, paragraphs, quote block, callout, and inline highlight.
- Right rail sections for tags, references, outline, and properties.
- Status strip with save state and document metrics.

## Content Direction

Use content that supports the botanical herbarium metaphor while still fitting a study tool:

- Example note title: `叶脉结构与记忆路径`
- Collection names: `植物认知`, `概念标本`, `复习温室`, `田野摘录`
- Tags: `#叶脉`, `#分类`, `#记忆路径`, `#观察法`, `#概念标本`
- References should look like related notes or source excerpts, not decorative copy.

## Static Demo Delivery

Create the final demo as a standalone HTML file under a new theme folder in
`apps/web/styles/UI主题/植物标本馆/`.

Recommended files:

- `herbarium-archive-demo.html`
- Optional `README.md` if useful for describing the direction.

The HTML may include internal CSS for portability. It should not be imported by the production app.

## Verification

Before handoff:

- Open or otherwise inspect the generated file enough to catch broken markup.
- Check that the page is visually complete without a local dev server.
- Confirm that no existing theme demo was modified or copied.
- Confirm `.superpowers/` is ignored because visual brainstorming scratch files are not product assets.

## Open Decisions

None. The user confirmed:

- Independent static demo.
- Knowledge-base / note-taking page.
- Botanical garden theme expressed as plant specimen archive.
- Formal archive direction over field-notebook or modern museum-database variants.
