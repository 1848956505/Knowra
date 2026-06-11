import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
const componentsCss = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');

assert.match(
  clientJs,
  /view:\s*\{/,
  'workspace should store dedicated view state for task 5'
);
assert.match(
  clientJs,
  /function renderViewMenu/,
  'editor menu bar should render a view menu'
);
assert.match(
  clientJs,
  /data-view-menu-action=/,
  'view menu should expose actionable controls'
);
assert.match(
  clientJs,
  /data-editor-menu-toggle="view"/,
  'editor menu bar should expose a view menu toggle'
);
assert.match(
  clientJs,
  /class="markdown-input"/,
  'source editor view should render a markdown textarea'
);
assert.match(
  clientJs,
  /case 'toggle-source-editor':[\s\S]*state\.view\.mode = 'edit';/,
  'opening the source editor should switch back into edit mode'
);
assert.match(
  clientJs,
  /case 'mode-edit':[\s\S]*state\.view\.showSourceEditor = false;/,
  'switching back to edit mode should close the source editor'
);
assert.match(
  clientJs,
  /case 'mode-focus':[\s\S]*state\.view\.showSourceEditor = false;/,
  'switching to focus mode should close the source editor'
);
assert.match(
  mainJs,
  /class="kb-sidebar" id="kb-sidebar"/,
  'left knowledge sidebar needs a stable DOM id for view toggles'
);
assert.match(
  mainJs,
  /class="kb-aside" id="kb-aside"/,
  'right assistant sidebar needs a stable DOM id for view toggles'
);
assert.match(
  componentsCss,
  /\.kb-workspace\[data-left-hidden='true'\]/,
  'workspace styles should support hiding the left sidebar'
);
assert.match(
  componentsCss,
  /data-right-hidden='true'/,
  'workspace styles should support hiding the right sidebar'
);
assert.match(
  componentsCss,
  /\.editor-content\[data-source-open='true'\]/,
  'source editor mode should define a dedicated split-layout style'
);

console.log('ok - task 5 view menu UI hooks are present');
