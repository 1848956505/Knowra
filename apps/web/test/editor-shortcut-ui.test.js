import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
const milkdownEntry = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown-entry.js'), 'utf8');
const componentsCss = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');

assert.match(
  clientJs,
  /const paragraphMenuItems = \[[\s\S]*label: 'H0'[\s\S]*label: 'H1'[\s\S]*label: 'H2'[\s\S]*label: 'H3'[\s\S]*label: 'H4'[\s\S]*label: 'H5'[\s\S]*label: 'H6'/,
  'paragraph menu should expose H0-H6 so the heading shortcuts have visible targets'
);
assert.match(
  clientJs,
  /label: '内部链接'/,
  'format menu should render readable Chinese labels instead of mojibake'
);
assert.match(
  clientJs,
  /editor-menu-shortcut/,
  'editor menus should render a dedicated shortcut label slot'
);
assert.match(
  clientJs,
  /resolveEditorShortcutAction\(event\)/,
  'editor should resolve custom keyboard shortcuts from the shared shortcut helper'
);
assert.match(
  clientJs,
  /function handleResolvedEditorShortcut\(action\)/,
  'editor should route resolved shortcuts through a dedicated action handler'
);
assert.match(
  clientJs,
  /currentEditorHost\.run\(action\)/,
  'resolved shortcuts should be executed through the editor host command system'
);
assert.match(
  milkdownEntry,
  /'paragraph': \(\) => \(\{ key: turnIntoTextCommand\.key \}\)/,
  'editor command resolver should support H0/paragraph shortcuts'
);
assert.match(
  milkdownEntry,
  /'heading-5': \(\) => \(\{ key: wrapInHeadingCommand\.key, payload: 5 \}\)/,
  'editor command resolver should support H5 shortcuts'
);
assert.match(
  milkdownEntry,
  /'heading-6': \(\) => \(\{ key: wrapInHeadingCommand\.key, payload: 6 \}\)/,
  'editor command resolver should support H6 shortcuts'
);
assert.match(
  milkdownEntry,
  /sinkListItemCommand\.key/,
  'editor shortcut execution should support Tab-based list indentation'
);
assert.match(
  milkdownEntry,
  /liftListItemCommand\.key/,
  'editor shortcut execution should support Shift\+Tab outdent and list toggle removal'
);
assert.match(
  componentsCss,
  /\.editor-menu-shortcut/,
  'shortcut labels need dedicated menu styling'
);

console.log('ok - editor shortcut UI hooks are present');
