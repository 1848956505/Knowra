import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const editorCommandsControllerJs = fs.readFileSync(path.resolve(__dirname, '../src/controllers/editor/commands-controller.js'), 'utf8');
const documentKeyboardEventsJs = fs.readFileSync(
  path.resolve(__dirname, '../lib/events/document-keyboard-events.js'),
  'utf8'
);
const milkdownEntry = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown-entry.js'), 'utf8');

assert.match(
  editorCommandsControllerJs,
  /function shouldHandleEditorShortcut\(event\)/,
  'editor shortcut handling should remain centralized in the editor controller'
);
assert.match(
  documentKeyboardEventsJs,
  /resolveEditorShortcutAction\(event\)/,
  'editor shortcut dispatch should continue to use the shared shortcut resolver'
);
assert.match(
  milkdownEntry,
  /async run\(commandKey,\s*options = \{\}\) \{/,
  'editor host should expose a single run entrypoint for menu actions and shortcuts'
);
assert.match(
  milkdownEntry,
  /if \(commandKey === 'indent'\)/,
  'editor host should intercept the Tab shortcut before browser focus navigation wins'
);
assert.match(
  milkdownEntry,
  /function insertTextIndent\(view\)[\s\S]*insertText\(' {4}', state\.selection\.from, state\.selection\.to\)/,
  'plain-text Tab indentation should insert four spaces for a noticeable indent step'
);
assert.match(
  milkdownEntry,
  /resolveIndentBehavior\(\{[\s\S]*inListItem: Boolean\(listItemAncestor\)[\s\S]*inBlockquote: Boolean\(blockquoteAncestor\)/,
  'editor host should route Tab and Shift+Tab through Typora-aware indentation behavior'
);
assert.match(
  milkdownEntry,
  /resolveBlockCommandBehavior\(commandKey\) === 'insert-below-current-block'[\s\S]*insertBlockBelowSelection\(this\.editor, commandKey, options\)/,
  'editor host should run insertion-type blocks below the current block instead of converting it in place'
);
assert.match(
  milkdownEntry,
  /findAncestorOfType\(\$from, new Set\(\['table'\]\)\)[\s\S]*exitTableWithParagraph\(view, paragraphNodeType, tableAncestor\.depth\)/,
  'Enter inside a table should exit the table into a paragraph below it'
);
assert.match(
  milkdownEntry,
  /function handleStructuredBackspace\(view\)[\s\S]*resolveBackspaceBehavior\(\{[\s\S]*parentType,[\s\S]*parentIsBlank,[\s\S]*atLineStart:/,
  'editor host should explicitly inspect Backspace on empty structured blocks before default ProseMirror deletion runs'
);
assert.match(
  milkdownEntry,
  /if \(commandKey === 'outdent'\)/,
  'editor host should intercept Shift\+Tab for outdent handling'
);
assert.match(
  milkdownEntry,
  /if \(commandKey === 'paragraph'\)/,
  'editor host should treat H0 as an explicit paragraph command'
);
assert.match(
  milkdownEntry,
  /if \(commandKey\.startsWith\('heading-'\)\)/,
  'editor host should special-case heading shortcuts so pressing the same level twice can cancel back to paragraph'
);
assert.match(
  milkdownEntry,
  /if \(commandKey === 'bullet' \|\| commandKey === 'ordered'\)/,
  'editor host should special-case list shortcuts so pressing them twice can remove the list format'
);

console.log('ok - V1.3.4 editor shortcut and toggle hooks are present');
