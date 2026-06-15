import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
const componentsCss = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');

assert.doesNotMatch(
  clientJs,
  /\{ key: 'tags', label: '标签' \}/,
  'left navigation should no longer expose a dedicated tags entry after V1.4.4'
);

assert.match(
  mainJs,
  /id="global-search-shell"/,
  'top bar should expose a dedicated search shell container for the tag-aware search UI'
);

assert.match(
  clientJs,
  /search:\s*\{\s*keyword:\s*''[\s\S]*selectedTagIds:\s*\[\][\s\S]*isOpen:\s*false/,
  'workspace state should centralize keyword and selected tags inside a dedicated search state object'
);

assert.match(
  clientJs,
  /function renderSearchShell\(\)/,
  'top bar should render its search shell through a dedicated renderer'
);

assert.match(
  clientJs,
  /elements\.globalSearchShell\?\.addEventListener\('click',\s*\(event\)\s*=>\s*\{[\s\S]*event\.stopPropagation\(\);[\s\S]*if \(!state\.search\.isOpen\)/,
  'opening the search panel should stop click propagation so global document handlers do not immediately close it'
);

assert.match(
  clientJs,
  /selectedTags\.slice\(0,\s*2\)/,
  'top bar should only embed a compact subset of selected tags into the fixed-width search shell'
);

assert.match(
  clientJs,
  /class="top-search-chip"/,
  'selected search tags should render as compact chips inside the top bar search shell'
);

assert.match(
  clientJs,
  /data-search-chip-remove="\$\{escapeAttribute\(tag\.id\)\}"/,
  'embedded search chips should support removing a selected tag'
);

assert.match(
  clientJs,
  /function renderSearchPanel\(\)/,
  'top bar should provide a dedicated dropdown panel for search and tag filtering'
);

assert.match(
  clientJs,
  /data-search-tag-id="\$\{escapeAttribute\(tag\.id\)\}"/,
  'search panel should render clickable global tag options'
);

assert.doesNotMatch(
  clientJs,
  /匹配笔记/,
  'dropdown panel should focus on managing filter conditions, while note results remain in the left tree'
);

assert.match(
  clientJs,
  /function toggleSearchTagFilter\(tagId\)/,
  'global tag selection should be handled by a dedicated search filter toggle helper'
);

assert.match(
  clientJs,
  /reconcileSelection\(\);\s*renderAll\(\);/,
  'changing keyword or tag filters should re-run the shared left-tree filtering flow'
);

assert.doesNotMatch(
  clientJs,
  /addEventListener\('focusin'/,
  'search shell should not re-render itself on focusin, otherwise typing can become unstable'
);

assert.doesNotMatch(
  clientJs,
  /function renderSearchShell\(\)[\s\S]{0,1600}requestAnimationFrame/,
  'search shell renderer should not force refocus after every open/render cycle'
);

assert.match(
  componentsCss,
  /\.top-bar-search\s*\{[\s\S]*max-width:\s*420px;[\s\S]*padding:\s*5px 10px;[\s\S]*border:\s*1px solid var\(--color-border\);[\s\S]*border-radius:\s*8px;/,
  'top search shell should keep the original compact width and frame styling'
);

assert.match(
  componentsCss,
  /\.top-search-chip/,
  'top bar chips should have dedicated compact styles'
);

assert.match(
  componentsCss,
  /\.search-panel/,
  'search dropdown panel should have dedicated styles'
);

assert.match(
  componentsCss,
  /\.search-panel-host\s*\{[\s\S]*z-index:\s*50;/,
  'search panel host should float above the workspace content when it expands from the top bar'
);

assert.match(
  componentsCss,
  /\.top-bar\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*3;/,
  'top bar should establish a higher stacking context so the search dropdown is not covered by the workspace stage'
);

console.log('ok - V1.4.4 top search chips and left-tree filtering hooks are present');
