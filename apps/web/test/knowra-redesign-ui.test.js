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
const shellHtml = renderHtml();

assert.match(tokens, /--text-2xs:\s*10px;/, 'small production copy should remain legible');
assert.match(
  tokens,
  /--document-tab-height:\s*var\(--menu-height\);/,
  'document tabs should share the compact toolbar height token'
);
assert.match(shell, /\.library-id\s*\{[^}]*font:\s*500/, 'library module number should restore the earlier condensed weight');
assert.match(
  shell,
  /\.library-header-toggle\[data-open='true'\]\s*\{[^}]*background:\s*var\(--blue\)/,
  'the open section menu trigger should become a blue square'
);
assert.match(shellHtml, /class="library-home-target" data-library-home="global"/, 'the module header should own the library home entry point');
assert.doesNotMatch(shellHtml, /class="brand"/, 'the production shell should not render the removed logo area');
assert.match(shell, /\.knowra-rail\s*\{[\s\S]*padding:\s*0\s+var\(--space-6\)\s+var\(--space-4\)/, 'the left module header should sit flush with the shell top');
assert.match(
  library,
  /\.index-filter-chevron\s*\{[^}]*width:\s*var\(--space-4\)[^}]*height:\s*var\(--space-4\)[^}]*fill:\s*none[^}]*stroke:\s*currentColor/,
  'filter chevrons should have bounded SVG geometry and an explicit stroke'
);
assert.match(tokens, /--index-selection-width:\s*2px;/, 'index selection should use the low-focus line token');
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
assert.match(library, /-webkit-line-clamp:\s*2;/, 'index summaries should be limited to two lines');
assert.doesNotMatch(
  library,
  /\.index-entry\[data-selected='true'\] \.entry-id,\s*\.index-entry\[data-selected='true'\] \.entry-reading/,
  'selection should not recolor secondary index metadata'
);
assert.match(library, /\.index-inspector\s*\{[^}]*padding:\s*0\s+var\(--space-5\)/, 'the right inspector header should sit flush with the shell top');
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
