import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');

assert.match(
  clientJs,
  /data-file-menu-action="import-markdown"/,
  'file menu should expose a Markdown import action'
);
assert.match(
  clientJs,
  /elements\.markdownImportInput\?\.click\(\)/,
  'file menu import action should trigger the hidden file input'
);
assert.match(
  clientJs,
  /async function importMarkdownFiles\(files\)/,
  'client should provide a dedicated markdown import flow'
);
assert.match(
  clientJs,
  /\/api\/knowledge\/notes\/import-markdown/,
  'API mode should use the markdown import endpoint'
);
assert.match(
  mainJs,
  /id="markdown-import-input"/,
  'main shell should include the hidden markdown import input'
);

console.log('ok - file menu markdown import hooks are present');
