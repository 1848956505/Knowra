import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
const milkdownEntry = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown-entry.js'), 'utf8');
const componentsCss = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');

assert.doesNotMatch(clientJs, /window\.prompt\(/, 'editor find/replace must not use browser prompt dialogs');
assert.doesNotMatch(clientJs, /window\.find\(/, 'editor find must use the in-app search panel instead of browser find');
assert.match(
  clientJs,
  /editor-utility-panel/,
  'editor should render a custom in-app utility panel for find and replace'
);
assert.match(
  clientJs,
  /submit-previous/,
  'editor find panel should expose an explicit previous-match action'
);
assert.match(
  clientJs,
  /function renderFormatMenu/,
  'editor format menu should provide a render function for the popover content'
);
assert.match(
  clientJs,
  /renderEditorMenuItem\(\{[\s\S]*actionAttr: 'data-format-menu-action'/,
  'editor format menu should render actionable format menu items'
);

const formatButtonsMatch = clientJs.match(/const formatButtons = \[([\s\S]*?)\];/);
assert.ok(formatButtonsMatch, 'editor format button definitions should exist');
assert.doesNotMatch(
  formatButtonsMatch[1],
  /heading-1|heading-2|heading-3|codeblock|label: 'H1'|label: 'H2'|label: 'H3'/,
  'editor format menu should not duplicate heading or code block entries that belong elsewhere'
);
assert.match(
  formatButtonsMatch[1],
  /label: '加粗'[\s\S]*label: '斜体'[\s\S]*label: '删除线'[\s\S]*label: '行内代码'[\s\S]*label: '高亮'/,
  'editor format menu should use Chinese labels and expose a highlight action'
);
assert.match(
  clientJs,
  /const paragraphMenuItems = \[[\s\S]*label: 'H1'[\s\S]*label: 'H2'[\s\S]*label: 'H3'[\s\S]*label: 'H4'[\s\S]*label: 'H5'[\s\S]*label: 'H6'/,
  'editor paragraph menu should use H1-H6 heading labels'
);
assert.match(
  clientJs,
  /document\.addEventListener\('keydown', \(event\) => \{[\s\S]*resolveEditorPanelKeyboardAction\(event\)[\s\S]*\}, true\);/,
  'editor find keyboard shortcuts should intercept Enter during capture so the editor cannot consume it first'
);
assert.match(
  componentsCss,
  /\.editor-utility-panel/,
  'custom editor utility panel needs dedicated styling'
);
assert.match(
  componentsCss,
  /\.editor-find-match-active/,
  'active find matches should have a dedicated highlight style'
);
assert.match(
  clientJs,
  /label: '内部链接'/,
  'editor format menu should expose an internal link action'
);
assert.match(
  milkdownEntry,
  /'internal-link': \(\) => \(\{ key: insertInternalLinkCommand\.key \}\)/,
  'milkdown command resolver should expose an internal link command'
);

console.log('ok - editor utility panel uses in-app UI instead of browser prompts');
