import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const editorCommandsControllerJs = fs.readFileSync(path.resolve(__dirname, '../src/controllers/editor/commands-controller.js'), 'utf8');
const milkdownEntry = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown-entry.js'), 'utf8');

assert.match(
  milkdownEntry,
  /import\s*\{[^}]*history[^}]*redoCommand[^}]*undoCommand[^}]*\}\s*from '@milkdown\/plugin-history';|import\s*\{[^}]*history[^}]*undoCommand[^}]*redoCommand[^}]*\}\s*from '@milkdown\/plugin-history';/,
  'milkdown editor should import history support and undo/redo commands'
);
assert.match(
  milkdownEntry,
  /\.use\(history\)/,
  'milkdown editor should enable the history plugin so format and paste transactions can be undone'
);
assert.match(
  milkdownEntry,
  /undo:\s*\(\)\s*=>\s*\(\{\s*key:\s*undoCommand\.key\s*\}\)/,
  'editor command resolver should expose undo through Milkdown history'
);
assert.match(
  milkdownEntry,
  /redo:\s*\(\)\s*=>\s*\(\{\s*key:\s*redoCommand\.key\s*\}\)/,
  'editor command resolver should expose redo through Milkdown history'
);
assert.match(
  editorCommandsControllerJs,
  /case 'undo':[\s\S]*await editorHost\.run\(action\);/,
  'edit menu undo should delegate to the editor host history instead of browser execCommand'
);
assert.match(
  editorCommandsControllerJs,
  /case 'redo':[\s\S]*await editorHost\.run\(action\);/,
  'edit menu redo should delegate to the editor host history instead of browser execCommand'
);
assert.doesNotMatch(
  editorCommandsControllerJs,
  /case 'undo':[\s\S]*document\.execCommand\(/,
  'undo should not use browser execCommand'
);
assert.doesNotMatch(
  editorCommandsControllerJs,
  /case 'redo':[\s\S]*document\.execCommand\(/,
  'redo should not use browser execCommand'
);

console.log('ok - editor undo/redo routes through Milkdown history');
