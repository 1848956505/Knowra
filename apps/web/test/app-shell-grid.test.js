import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '../src/server/shell-html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shellCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/components/knowra-inkgrid-shell.css'),
  'utf8'
);
const editorCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/components/knowra-inkgrid-editor.css'),
  'utf8'
);
const responsiveCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/components/responsive.css'),
  'utf8'
);
const shellHtml = renderHtml('<!-- initial workspace -->');

const topBarIndex = shellHtml.indexOf('data-ui-topbar');
const shellBodyIndex = shellHtml.indexOf('data-ui-shell-body');
const statusBarIndex = shellHtml.indexOf('data-ui-status-bar');

assert.match(
  shellHtml,
  /<div class="app-shell workspace-shell app-root knowra-production-shell"[^>]*id="workspace-shell"/,
  'SSR should keep the formal AppShell marker and existing workspace-shell ID'
);
assert.ok(topBarIndex >= 0, 'SSR should expose the TopBar slot');
assert.ok(shellBodyIndex > topBarIndex, 'ShellBody should follow TopBar in the AppShell');
assert.ok(statusBarIndex > shellBodyIndex, 'StatusBarHost should follow ShellBody in the AppShell');
assert.match(
  shellHtml,
  /<div class="shell-body" data-ui-shell-body>[\s\S]*<aside class="kb-sidebar knowra-rail"[^>]*id="kb-sidebar"[\s\S]*<div class="feature-stage workspace-main" data-ui-feature-stage>/,
  'ShellBody should own the existing navigation rail and feature stage'
);
assert.match(
  shellHtml,
  /<footer class="status-bar status-bar-host"[^>]*data-region="shell-footer"[\s\S]*id="status-indicators"[\s\S]*id="status-meta"/,
  'StatusBarHost should remain the single global status renderer host'
);
assert.match(shellHtml, /id="library-context-menu"[^>]*hidden/, 'library context menu host should remain in SSR');
assert.match(shellHtml, /id="markdown-import-input"[^>]*multiple hidden/, 'markdown import input should remain in SSR');
assert.match(shellHtml, /<!-- initial workspace -->/, 'SSR initial workspace script slot should remain available');

assert.match(
  shellCss,
  /\.knowra-production-shell\s*\{[\s\S]*grid-template-rows:\s*var\(--ink-topbar-h\)\s+minmax\(0,\s*1fr\)\s+var\(--ink-statusbar-h\);/,
  'AppShell should use the canonical three-row TopBar/ShellBody/StatusBar grid'
);
assert.match(
  shellCss,
  /\.knowra-production-shell \.shell-body\s*\{[\s\S]*grid-template-columns:\s*var\(--rail-width\)\s+minmax\(0,\s*1fr\);[\s\S]*overflow:\s*hidden;/,
  'ShellBody should contain the navigation and feature stage without page overflow'
);
assert.match(
  shellCss,
  /\.knowra-production-shell \.status-bar-host\s*\{[\s\S]*z-index:\s*25;[\s\S]*height:\s*var\(--ink-statusbar-h\);[\s\S]*overflow:\s*hidden;/,
  'StatusBarHost should keep a fixed height and stacking context outside the body'
);
assert.doesNotMatch(
  shellCss,
  /data-screen='index'[\s\S]*status-bar[^}]*display:\s*none/,
  'the global status host should not disappear on the index screen'
);

assert.match(
  responsiveCss,
  /@media \(max-width:\s*1040px\)[\s\S]*\.kb-sidebar\s*\{\s*order:\s*2;/,
  'responsive.css still carries the legacy flex order rule for <=1040px'
);
assert.match(
  shellCss,
  /\.knowra-production-shell \.shell-body \.kb-sidebar\s*\{\s*order:\s*0;/,
  'ShellBody must reset the legacy sidebar order inside its Grid context'
);
assert.match(
  editorCss,
  /@media \(max-width:\s*1040px\)[\s\S]*\.knowra-production-shell \.editor-workspace-view \.kb-workspace\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  'the compact editor must collapse its hidden marginalia column instead of forcing 700px + 240px into the FeatureStage'
);
assert.match(
  editorCss,
  /@media \(max-width:\s*1040px\)[\s\S]*\.knowra-production-shell \.editor-workspace \.editor-content\[data-source-open='true'\]\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  'the compact source editor must remain single-column and reachable'
);

const sidebarDomIndex = shellHtml.indexOf('id="kb-sidebar"');
const featureStageDomIndex = shellHtml.indexOf('data-ui-feature-stage');
assert.ok(
  sidebarDomIndex >= 0 && featureStageDomIndex > sidebarDomIndex,
  'the navigation rail must precede the feature stage in SSR DOM order'
);
assert.match(
  shellHtml,
  /data-ui-feature-stage>[\s\S]*id="work-domain-view"[\s\S]*id="library-index-view"[\s\S]*id="editor-workspace-view"/,
  'index, editor and knowledge domain views must stay inside the FeatureStage'
);

console.log('ok - AppShell renders the canonical three-row InkGrid grid');
