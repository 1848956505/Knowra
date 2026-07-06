import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCssWithImports } from './helpers/read-css.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shortcutCommandControllerJs = fs.readFileSync(path.resolve(__dirname, '../src/controllers/editor/commands/shortcut-controller.js'), 'utf8');
const menuRenderersJs = fs.readFileSync(path.resolve(__dirname, '../lib/editor/menu-renderers.js'), 'utf8');
const documentKeyboardEventsJs = fs.readFileSync(
  path.resolve(__dirname, '../lib/events/document-keyboard-events.js'),
  'utf8'
);
const milkdownEntry = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown-entry.js'), 'utf8');
const commandResolversJs = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown/commands/command-resolvers.js'), 'utf8');
const shortcutHandlersJs = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown/commands/shortcut-handlers.js'), 'utf8');
const indentationHandlersJs = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown/commands/indentation-handlers.js'), 'utf8');
const componentsCss = readCssWithImports(path.resolve(__dirname, '../styles/components.css'));

assert.match(
  menuRenderersJs,
  /const PARAGRAPH_MENU_ITEMS = \[[\s\S]*label: '正文'[\s\S]*label: 'H1'[\s\S]*label: 'H2'[\s\S]*label: 'H3'[\s\S]*label: 'H4'[\s\S]*label: 'H5'[\s\S]*label: 'H6'/,
  'paragraph menu should expose 正文+H1-H6 so the heading shortcuts have visible targets'
);
assert.match(
  menuRenderersJs,
  /label: '内部链接'/,
  'format menu should render readable Chinese labels instead of mojibake'
);
assert.match(
  menuRenderersJs,
  /editor-menu-shortcut/,
  'editor menus should render a dedicated shortcut label slot'
);
assert.match(
  menuRenderersJs,
  /const FORMAT_QUICK_ACTIONS = \[[\s\S]*key: 'code'/,
  'editor menu bar should expose a quick action for inline code'
);
assert.match(
  menuRenderersJs,
  /const FORMAT_QUICK_ACTIONS = \[[\s\S]*key: 'codeblock'/,
  'editor menu bar should expose a quick action for code blocks'
);
assert.match(
  documentKeyboardEventsJs,
  /resolveEditorShortcutAction\(event\)/,
  'editor should resolve custom keyboard shortcuts from the shared shortcut helper'
);
assert.match(
  shortcutCommandControllerJs,
  /function handleResolvedEditorShortcut\(action\)/,
  'editor should route resolved shortcuts through a dedicated action handler'
);
assert.match(
  shortcutCommandControllerJs,
  /editorRuntime\.currentEditorHost\.run\(action\)/,
  'resolved shortcuts should be executed through the editor host command system'
);
assert.match(
  commandResolversJs,
  /'paragraph': \(\) => \(\{ key: turnIntoTextCommand\.key \}\)/,
  'editor command resolver should support H0/paragraph shortcuts'
);
assert.match(
  commandResolversJs,
  /'heading-5': \(\) => \(\{ key: wrapInHeadingCommand\.key, payload: 5 \}\)/,
  'editor command resolver should support H5 shortcuts'
);
assert.match(
  commandResolversJs,
  /'heading-6': \(\) => \(\{ key: wrapInHeadingCommand\.key, payload: 6 \}\)/,
  'editor command resolver should support H6 shortcuts'
);
assert.match(
  indentationHandlersJs,
  /sinkListItemCommand\.key/,
  'editor shortcut execution should support Tab-based list indentation'
);
assert.match(
  indentationHandlersJs,
  /liftListItemCommand\.key/,
  'editor shortcut execution should support Shift\+Tab outdent and list toggle removal'
);
assert.match(
  shortcutHandlersJs,
  /from '.\/indentation-handlers\.js'/,
  'shortcut handlers should delegate indentation shortcuts to the dedicated indentation module'
);
assert.match(
  componentsCss,
  /\.editor-menu-shortcut/,
  'shortcut labels need dedicated menu styling'
);
assert.match(
  componentsCss,
  /\.editor-format-quick-actions/,
  'quick format actions need dedicated toolbar styling'
);

console.log('ok - editor shortcut UI hooks are present');
