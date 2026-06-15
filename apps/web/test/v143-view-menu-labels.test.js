import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');

assert.match(
  clientJs,
  /data-editor-menu-toggle="view"[\s\S]*视图/,
  'view menu toggle should show a readable Chinese label instead of mojibake'
);

assert.match(
  clientJs,
  /阅读模式/,
  'view menu should show a readable Chinese label for read mode'
);

assert.match(
  clientJs,
  /编辑模式/,
  'view menu should show a readable Chinese label for edit mode'
);

assert.match(
  clientJs,
  /专注模式/,
  'view menu should show a readable Chinese label for focus mode'
);

assert.match(
  clientJs,
  /隐藏左侧目录区|显示左侧目录区/,
  'view menu should show readable left-sidebar toggle labels'
);

assert.match(
  clientJs,
  /隐藏右侧辅助区|显示右侧辅助区/,
  'view menu should show readable right-sidebar toggle labels'
);

assert.match(
  clientJs,
  /隐藏源码编辑器|显示源码编辑器/,
  'view menu should show readable source-editor toggle labels'
);

console.log('ok - V1.4.3 view menu labels remain readable');
