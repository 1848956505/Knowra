import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
const renderViewMenuSource = clientJs.match(/function renderViewMenu[\s\S]*?function renderFileMenu/)?.[0] ?? '';

assert.match(
  clientJs,
  /data-file-menu-action="import-markdown"/,
  'file menu should expose a Markdown import action'
);
assert.doesNotMatch(
  renderViewMenuSource,
  /data-file-menu-action="import-markdown"/,
  'view menu should no longer expose the Markdown import action'
);
assert.match(
  clientJs,
  /elements\.markdownImportInput\?\.click\(\)/,
  'file menu import action should trigger the hidden file input'
);
assert.match(
  clientJs,
  /const files = Array\.from\(event\.target\.files \?\? \[\]\);[\s\S]*event\.target\.value = '';/,
  'markdown import change handler should snapshot selected files before clearing the input value'
);
assert.doesNotMatch(
  clientJs,
  /const files = event\.target\.files;[\s\S]*event\.target\.value = '';/,
  'markdown import change handler should not keep a live FileList reference after clearing the input'
);
assert.match(
  clientJs,
  /async function importMarkdownFiles\(files\)/,
  'client should provide a dedicated markdown import flow'
);
assert.match(
  clientJs,
  /knowledgeApi\.importMarkdownNotes/,
  'API mode should import markdown through the API service'
);
assert.match(
  mainJs,
  /id="markdown-import-input"/,
  'main shell should include the hidden markdown import input'
);

console.log('ok - file menu markdown import hooks are present');
