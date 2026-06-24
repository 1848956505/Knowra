import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
const componentsCss = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');
const milkdownEntry = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown-entry.js'), 'utf8');
const sidebarInfoPanelJs = fs.readFileSync(path.resolve(__dirname, '../lib/sidebar/info-panel.js'), 'utf8');

assert.match(
  sidebarInfoPanelJs,
  /stats\.characterCount/,
  'info tab should only show a single character-count row in V1.4.1'
);
assert.doesNotMatch(
  sidebarInfoPanelJs,
  /paragraphCount|headingCount/,
  'info tab should no longer show paragraph and heading counts'
);

assert.match(
  mainJs,
  /id="editor-context-menu"/,
  'workspace shell should expose a dedicated editor context menu mount'
);
assert.match(
  clientJs,
  /elements\.editorContent\?\.addEventListener\('contextmenu'/,
  'editor surface should intercept right-clicks to open the custom quick menu'
);
assert.match(
  clientJs,
  /const editorContextPrimaryActions = \[[\s\S]*cut[\s\S]*copy[\s\S]*paste[\s\S]*delete[\s\S]*\];/,
  'context menu should define the four primary actions at the top'
);
assert.match(
  clientJs,
  /const editorContextFormatActions = \[[\s\S]*bold[\s\S]*italic[\s\S]*codeblock[\s\S]*quote[\s\S]*\];/,
  'context menu should include Typora-like inline formatting actions'
);
assert.match(
  clientJs,
  /const editorContextListActions = \[[\s\S]*ordered[\s\S]*bullet[\s\S]*task-list[\s\S]*\];/,
  'context menu should expose ordered, bullet, and task list actions'
);
assert.match(
  clientJs,
  /const editorContextIndentActions = \[[\s\S]*outdent[\s\S]*indent[\s\S]*\];/,
  'context menu should expose outdent and indent actions'
);
assert.match(
  clientJs,
  /const editorContextParagraphItems = \[[\s\S]*paragraph[\s\S]*heading-1[\s\S]*heading-2[\s\S]*heading-3[\s\S]*heading-4[\s\S]*heading-5[\s\S]*heading-6[\s\S]*\];/,
  'paragraph submenu should expose H0-H6 entries'
);
assert.match(
  clientJs,
  /const editorContextInsertItems = \[[\s\S]*hr[\s\S]*image[\s\S]*codeblock[\s\S]*quote[\s\S]*paragraph-above[\s\S]*paragraph-below[\s\S]*\];/,
  'insert submenu should expose image, divider, code block, quote, and paragraph insertion actions'
);
assert.match(
  clientJs,
  /function renderEditorContextMenu\(\)/,
  'context menu should render through a dedicated function'
);
assert.match(
  componentsCss,
  /\.editor-context-menu[\s\S]*position:\s*fixed;/,
  'context menu should use fixed positioning near the cursor'
);
assert.match(
  componentsCss,
  /\.editor-context-submenu/,
  'context menu should provide dedicated submenu styling'
);
assert.match(
  milkdownEntry,
  /if \(commandKey === 'paragraph-above'\)/,
  'editor host should understand paragraph-above insertions'
);
assert.match(
  milkdownEntry,
  /if \(commandKey === 'paragraph-below'\)/,
  'editor host should understand paragraph-below insertions'
);

console.log('ok - V1.4.1 context menu hooks are present');
