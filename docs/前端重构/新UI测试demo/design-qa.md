# Design QA

## Current change

- The left rail is now a narrower, viewport-height rail aligned to the Knowra home reference.
- The brand lockup is compact and uses the home reference hierarchy: blue K mark, Knowra name, and muted subtitle.
- Default module numbers use a taller condensed display treatment.
- The active module header uses the reference structure: blue module number, Chinese title, English label, upper-right arrow, and cobalt bottom rule.
- The default rail keeps the five large-number product modules.
- Selecting `01 资料库` changes the rail into a directory mode.
- The library rail now contains content views, a scrollable folder/file tree, recent edits, favorites, and recycle bin.
- The `01–05` square module switcher and settings control stay fixed below the directory.
- Folder selection filters the right-side material index; file selection opens the editor.
- The folded module list distributes 01–05 evenly through the available rail height.
- The folded state keeps one separator below 05 before the settings entry.
- The expanded directory scroll region is extended toward the rail edge so its scrollbar does not sit deep inside the content column.

## Build evidence

- `npm run build`: passed.
- `node scripts/build-standalone.mjs`: passed.
- Local Vite entry returned HTTP 200.
- Source files passed `git diff --check`.

## Visual verification status

- The in-app browser connection is currently blocked by `Cannot redefine property: process` during browser bootstrap.
- Because a rendered screenshot and interaction capture could not be obtained in this turn, the current state is not marked as visually passed.

## Remaining design checks

- Confirm the directory tree density at the target 1440 × 1024 viewport.
- Confirm long folder/file names, deep nesting, and empty folders.
- Confirm the fixed module switcher remains visible while the directory scrolls.
- Confirm editor mode keeps the same directory state and preserves the selected folder context.
- Confirm the folded-state spacing and separator count against the supplied reference screenshot.
- Confirm the expanded-state scrollbar offset at the target viewport.

final result: blocked
