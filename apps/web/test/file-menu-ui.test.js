import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const editorFileControllerJs = fs.readFileSync(path.resolve(__dirname, '../src/controllers/editor/file-controller.js'), 'utf8');
const menuRenderersJs = fs.readFileSync(path.resolve(__dirname, '../lib/editor/menu-renderers.js'), 'utf8');
const searchEventsJs = fs.readFileSync(path.resolve(__dirname, '../lib/events/search-events.js'), 'utf8');
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
const renderViewMenuSource = menuRenderersJs.match(/function renderViewMenu[\s\S]*?function renderFileMenu/)?.[0] ?? '';

assert.match(
  menuRenderersJs,
  /data-file-menu-action="import-markdown"/,
  'file menu should expose a Markdown import action'
);
assert.doesNotMatch(
  renderViewMenuSource,
  /data-file-menu-action="import-markdown"/,
  'view menu should no longer expose the Markdown import action'
);
assert.match(
  editorFileControllerJs,
  /elements\.markdownImportInput\?\.click\(\)/,
  'file menu import action should trigger the hidden file input'
);
assert.match(
  searchEventsJs,
  /const files = Array\.from\(event\.target\.files \?\? \[\]\);[\s\S]*event\.target\.value = '';/,
  'markdown import change handler should snapshot selected files before clearing the input value'
);
assert.doesNotMatch(
  searchEventsJs,
  /const files = event\.target\.files;[\s\S]*event\.target\.value = '';/,
  'markdown import change handler should not keep a live FileList reference after clearing the input'
);
assert.match(
  editorFileControllerJs,
  /async function importMarkdownFiles\(files\)/,
  'client should provide a dedicated markdown import flow'
);
assert.match(
  editorFileControllerJs,
  /knowledgeApi\.importMarkdownNotes/,
  'API mode should import markdown through the API service'
);
assert.match(
  mainJs,
  /id="markdown-import-input"/,
  'main shell should include the hidden markdown import input'
);

console.log('ok - file menu markdown import hooks are present');
