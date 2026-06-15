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
  /const SECONDARY_SECTION_ITEMS = \[\s*\{ key: 'favorites', label: '收藏' },\s*\{ key: 'recent', label: '最近' },\s*\{ key: 'recycle', label: '回收站' }\s*\];/,
  'left navigation section toggles should only keep favorites, recent, and recycle sections after the tag redesign'
);

assert.match(
  mainJs,
  /id="aside-tabs"[\s\S]*data-aside-tab="info"[\s\S]*信息[\s\S]*data-aside-tab="outline"[\s\S]*大纲[\s\S]*data-aside-tab="concepts"[\s\S]*知识点[\s\S]*data-aside-tab="ai"[\s\S]*AI/,
  'right rail shell should expose the four V1.4 tabs in a dedicated tab bar'
);

assert.match(
  clientJs,
  /asideTab:\s*'info'/,
  'workspace state should track the active right-rail tab and default it to the info panel'
);

assert.match(
  clientJs,
  /function getNoteStats\(markdown\)/,
  'info tab should derive note statistics from the current markdown draft'
);

assert.match(
  clientJs,
  /function buildFolderPath\(folderId\)/,
  'info tab should reconstruct the current note path instead of only showing the leaf folder name'
);

console.log('ok - V1.4.0 right rail tab shell hooks are present');
