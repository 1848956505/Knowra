import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMarkdownHeadings, renderMarkdownPreview } from '../lib/markdown.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
const outlinePanelJs = fs.readFileSync(path.resolve(__dirname, '../lib/sidebar/outline-panel.js'), 'utf8');

const headings = extractMarkdownHeadings(`# 一级
## 二级
### 三级
#### 四级
##### 五级
###### 六级`);

assert.deepEqual(
  headings.map((heading) => heading.level),
  [1, 2, 3, 4, 5, 6],
  'outline extraction should include H1 through H6 so every editor heading can appear in the right rail'
);

const duplicateHeadings = extractMarkdownHeadings(`# 重复标题
## 重复标题
### 重复标题`);

assert.equal(
  new Set(duplicateHeadings.map((heading) => heading.id)).size,
  duplicateHeadings.length,
  'outline extraction should generate unique anchor ids even when headings reuse the same title'
);

const previewHtml = renderMarkdownPreview(`#### 四级标题

##### 五级标题

###### 六级标题`);

assert.match(
  previewHtml,
  /<h4 id="[^"]+">四级标题<\/h4>/,
  'markdown preview should render H4 headings with anchor ids for outline jumps'
);
assert.match(
  previewHtml,
  /<h5 id="[^"]+">五级标题<\/h5>/,
  'markdown preview should render H5 headings with anchor ids for outline jumps'
);
assert.match(
  previewHtml,
  /<h6 id="[^"]+">六级标题<\/h6>/,
  'markdown preview should render H6 headings with anchor ids for outline jumps'
);

assert.match(
  outlinePanelJs,
  /data-outline-index="\$\{heading\.index\}"/,
  'outline items should keep their heading order so rich editor jumps can fall back to DOM heading position'
);
assert.match(
  clientJs,
  /querySelectorAll\('h1, h2, h3, h4, h5, h6'\)/,
  'outline click handling should inspect rendered heading elements instead of relying on preview-only ids'
);

console.log('ok - V1.4.3 outline navigation supports full heading ranges and stable jumps');
