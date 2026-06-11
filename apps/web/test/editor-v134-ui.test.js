import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
const milkdownEntry = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown-entry.js'), 'utf8');

assert.match(
  clientJs,
  /function shouldHandleEditorShortcut\(event\)/,
  'editor shortcut handling should remain centralized in the client shell'
);
assert.match(
  clientJs,
  /resolveEditorShortcutAction\(event\)/,
  'editor shortcut dispatch should continue to use the shared shortcut resolver'
);
assert.match(
  milkdownEntry,
  /async run\(commandKey\) \{/,
  'editor host should expose a single run entrypoint for menu actions and shortcuts'
);
assert.match(
  milkdownEntry,
  /if \(commandKey === 'indent'\)/,
  'editor host should intercept the Tab shortcut before browser focus navigation wins'
);
assert.match(
  milkdownEntry,
  /insertText\(' {4}', view\.state\.selection\.from, view\.state\.selection\.to\)/,
  'plain-text Tab indentation should insert four spaces for a noticeable indent step'
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
