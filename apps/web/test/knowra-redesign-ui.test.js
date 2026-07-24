import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../src/server/shell-html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readStyle = (name) => fs.readFileSync(
  path.resolve(__dirname, `../styles/components/${name}`),
  'utf8'
);

const tokens = readStyle('knowra-theme-tokens.css');
const shell = readStyle('knowra-shell.css');
const library = readStyle('knowra-library-index.css');
const editor = readStyle('knowra-editor.css');
const menus = readStyle('knowra-menus.css');
const typography = readStyle('knowra-typography.css');
const shellHtml = renderHtml();
const iconPath = (name) => path.resolve(__dirname, `../styles/icons/${name}`);

assert.match(tokens, /--font-ui:\s*'SF Pro Rounded',\s*'PingFang SC'/, 'interface copy should use the rounded UI font stack');
assert.match(tokens, /--font-reading:\s*'Songti SC',\s*'Source Han Serif SC'/, 'note content should use the sharp serif reading stack');
assert.match(tokens, /--font-body:\s*var\(--font-ui\);/, 'legacy body references should resolve to the unified UI stack');
assert.match(tokens, /--type-micro:\s*11px;/, 'microcopy should use the smallest legible production step');
assert.match(tokens, /--type-control:\s*14px;/, 'buttons and interface information should share one control step');
assert.match(tokens, /--type-reading:\s*18px;/, 'note content should use the shared reading size');
assert.match(tokens, /--type-heading-4:\s*var\(--type-title-sm\);[\s\S]*--type-heading-3:\s*22px;[\s\S]*--type-heading-2:\s*28px;[\s\S]*--type-heading-1:\s*36px;/, 'note headings should use the unified H1-H4 scale');
assert.match(typography, /\.editor-workspace \.document-title-input,[\s\S]*font-family:\s*var\(--font-reading\)/, 'the note title and note body should share the reading family');
assert.match(typography, /\.editor-workspace \.milkdown-host \.ProseMirror,[\s\S]*font-size:\s*var\(--text-body\)[\s\S]*line-height:\s*var\(--line-height-reading\)/, 'editor and preview copy should share reading metrics');
assert.match(typography, /\.milkdown-code-block \.tools,[\s\S]*font-family:\s*var\(--font-ui\)/, 'embedded editor controls should remain in the UI family');
assert.match(
  tokens,
  /--document-tab-height:\s*var\(--menu-height\);/,
  'document tabs should share the compact toolbar height token'
);
assert.match(shell, /\.library-mark\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*border:\s*0[^}]*background:\s*transparent/, 'the library header should reuse the unframed knowledge module mark');
assert.match(shell, /\.library-mark-icon\s*\{[^}]*width:\s*38px[^}]*height:\s*38px/, 'the current module mark should remain legible without an active-state frame');
assert.match(shell, /\.rail-item-icon img\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/, 'module switcher artwork should fill its large icon frame');
assert.match(
  shell,
  /\.library-header-toggle\[data-open='true'\]\s*\{[^}]*background:\s*var\(--blue\)/,
  'the open section menu trigger should become a blue square'
);
assert.match(shellHtml, /class="library-home-target" data-library-home="global"/, 'the module header should own the library home entry point');
assert.match(shellHtml, /class="library-mark-icon" src="\/styles\/icons\/phosphor-books-duotone\.svg"/, 'the module header should share the knowledge icon asset');
assert.doesNotMatch(shellHtml, /class="library-id"|CONTENT &amp; FOLDERS/, 'the old numeric mark and duplicate directory English label should be removed');
assert.match(shellHtml, /class="scope-summary" id="library-index-scope"/, 'the browsing scope summary should remain in the index masthead');
assert.doesNotMatch(shellHtml, /class="brand"/, 'the production shell should not render the removed logo area');
assert.match(shell, /\.knowra-rail\s*\{[\s\S]*padding:\s*0\s+var\(--space-6\)\s+var\(--space-4\)/, 'the left module header should sit flush with the shell top');
assert.match(
  library,
  /\.index-filter-chevron\s*\{[^}]*width:\s*var\(--space-4\)[^}]*height:\s*var\(--space-4\)[^}]*fill:\s*none[^}]*stroke:\s*currentColor/,
  'filter chevrons should have bounded SVG geometry and an explicit stroke'
);
assert.match(tokens, /--index-selection-width:\s*2px;/, 'index selection should use the low-focus line token');
assert.match(tokens, /--masthead-height:\s*76px;/, 'the approved compact masthead height should be shared');
assert.match(tokens, /--index-row-height:\s*124px;/, 'the approved compact index row height should be shared');
assert.match(tokens, /--status-height:\s*var\(--space-8\);/, 'the status bar should use the compact shared 32px rhythm');
assert.match(tokens, /--editor-focus-frame-width:\s*calc\(var\(--editor-max-width\) \+ var\(--space-20\)\);/, 'focus mode should use a bounded centered writing frame');
assert.match(
  library,
  /\.masthead \.primary-button\s*\{[^}]*height:\s*var\(--control-height-md\)[^}]*border:\s*var\(--border-thin\) solid var\(--blue\)[^}]*background:\s*transparent/,
  'the index create action should remain a lightweight outlined control'
);
assert.match(
  library,
  /\.index-entry\s*\{[^}]*height:\s*var\(--index-row-height\)[^}]*min-height:\s*var\(--index-row-height\)[^}]*overflow:\s*hidden/,
  'index rows should keep a stable rhythm when summaries vary in length'
);
assert.match(
  library,
  /\.index-entry\[data-selected='true'\]::before\s*\{[^}]*width:\s*var\(--index-selection-width\)/,
  'the selected index marker should use the subtle selection width'
);
assert.match(library, /-webkit-line-clamp:\s*1;/, 'index summaries should keep the approved single-line compact rhythm');
assert.match(library, /\.entry-book-cover\s*\{[^}]*width:\s*70px[^}]*height:\s*70px[^}]*opacity:\s*0\.5/, 'note rows should use the large blue book-cover mark');
assert.match(library, /\.index-entry \.tag-row > span:not\(\.tag-empty\)\s*\{[^}]*border-color:\s*var\(--line-soft\)[^}]*color:\s*var\(--muted\)/, 'unselected index tags should remain low contrast');
assert.match(library, /\.index-entry\[data-selected='true'\] \.tag-row > span:not\(\.tag-empty\)\s*\{[^}]*border-color:\s*var\(--blue\)[^}]*color:\s*var\(--blue\)/, 'selected index tags should use the blue accent');
assert.doesNotMatch(library, /\.index-entry:hover \.tag-row/, 'hovering an index row should not recolor its tags');
assert.doesNotMatch(
  library,
  /\.index-entry\[data-selected='true'\] \.entry-id,\s*\.index-entry\[data-selected='true'\] \.entry-reading/,
  'selection should not recolor secondary index metadata'
);
assert.match(library, /\.index-inspector\s*\{[^}]*padding:\s*0\s+var\(--space-5\)/, 'the right inspector header should sit flush with the shell top');
assert.match(
  library,
  /\.inspector-heading-copy\s*\{[^}]*grid-template-columns:\s*var\(--space-7\) minmax\(0, 1fr\)/,
  'the inspector header should align the open-book icon with the content hierarchy'
);
assert.match(
  library,
  /\.inspector-heading-title\s*\{[^}]*color:\s*var\(--ink\)[^}]*font-size:\s*var\(--text-base\)[^}]*font-weight:\s*700/,
  'the current note should be the inspector header primary title'
);
assert.match(library, /\.entry-heading h2\s*\{[^}]*font-size:\s*var\(--text-title-sm\)[^}]*font-weight:\s*800/, 'index note titles should keep the stronger approved hierarchy');
assert.match(library, /\.masthead-kicker\s*\{[^}]*margin-top:\s*0[^}]*color:\s*var\(--blue\)/, 'the English module title should align tightly below the Chinese title');
assert.match(library, /\.masthead\s*\{[^}]*grid-template-columns:\s*minmax\(220px, 1fr\) minmax\(210px, 280px\) auto/, 'the masthead should reserve a complete middle column for browsing scope');
assert.match(library, /\.scope-summary > strong\s*\{[^}]*font-size:\s*var\(--text-title-sm\)[^}]*font-weight:\s*800/, 'the current browsing scope should remain complete and visually prominent');
assert.match(library, /\.inspector-heading\s*\{[\s\S]*padding:\s*var\(--space-4\) var\(--space-5\) var\(--space-4\) var\(--space-3\)/, 'the inspector icon should move toward the outer edge');
assert.match(library, /\.inspector-heading-copy\s*\{[^}]*gap:\s*var\(--space-3\)/, 'the inspector icon should keep clearer separation from the note title');
assert.match(
  library,
  /\.inspector-open-icon\s*\{[^}]*width:\s*var\(--space-4\)[^}]*height:\s*var\(--space-4\)[^}]*opacity:\s*1/,
  'the inspector open icon should remain fully visible'
);
assert.match(
  library,
  /\.entry-action-icon\s*\{[^}]*width:\s*var\(--text-base\)[^}]*height:\s*var\(--text-base\)[^}]*opacity:\s*1/,
  'the index row open icon should remain fully visible'
);
assert.match(library, /\.inspector-fixed-section > header h3\s*\{[^}]*font-size:\s*var\(--text-base\)/, 'right section titles should share the left navigation title scale');
assert.match(library, /\.section-icon\s*\{[^}]*width:\s*18px[^}]*height:\s*18px/, 'right section icons should share the approved navigation icon scale');
assert.match(editor, /\.document-title-row\s*\{[^}]*border-left:\s*var\(--border-selection\) solid var\(--blue\)/, 'the document title should begin directly after the blue guide line');
assert.match(editor, /\.document-title-input\s*\{[^}]*color:\s*var\(--blue\)[^}]*font:\s*800/, 'the file title should replace the decorative document number as the primary blue heading');
assert.doesNotMatch(editor, /\.document-id\s*\{/, 'the removed decorative document number should not retain production styling');
assert.match(editor, /\.preview-rendered h2\s*\{[^}]*color:\s*var\(--ink\)/, 'ordinary H2 headings should return to the same black hierarchy as other headings');
assert.match(editor, /data-knowra-emphasis='true'[\s\S]*border-bottom:[^;]+;[\s\S]*color:\s*var\(--blue\)/, 'the former blue divider treatment should remain reserved for future emphasized headings');
assert.match(editor, /data-view-mode='focus'[\s\S]*\.preview-rendered[\s\S]*margin-inline:\s*auto/, 'focus mode should center both editing and reading columns');
[
  'phosphor-books-duotone.svg',
  'phosphor-exam-duotone.svg',
  'phosphor-atom-duotone.svg',
  'phosphor-list-checks-duotone.svg',
  'phosphor-arrows-clockwise-duotone.svg',
  'phosphor-book-bookmark-duotone.svg',
  'phosphor-plus-bold.svg'
].forEach((name) => assert.equal(fs.existsSync(iconPath(name)), true, `${name} should be served as a production asset`));
assert.match(
  editor,
  /\.note-tab-close\s*\{[^}]*margin-left:\s*auto/,
  'tab close controls should align at the far edge'
);
assert.match(
  editor,
  /\.note-tab-overflow-menu\s*\{[^}]*width:\s*var\(--rail-width\)/,
  'hidden tabs should use the production overflow menu instead of widening the editor'
);
assert.match(
  editor,
  /\.annotation-marker\s*\{[^}]*background:\s*var\(--blue-wash\)[^}]*var\(--blue\)/,
  'important text should use the production blue annotation treatment'
);
assert.match(
  editor,
  /\.editor-menu-text\[data-open='true'\],[\s\S]*background:\s*var\(--blue\)/,
  'open editor menu buttons should use the blue square active state'
);
assert.match(
  editor,
  /\.editor-inspector \.resource-row\s*\{[^}]*border-radius:\s*var\(--radius-none\)/,
  'attachment rows should use the production square treatment'
);
assert.match(
  menus,
  /\.library-context-menu,[\s\S]*border-radius:\s*var\(--radius-none\)/,
  'shared context menus should use the square editorial surface'
);

console.log('ok - Knowra redesign keeps the repaired visual contracts');
