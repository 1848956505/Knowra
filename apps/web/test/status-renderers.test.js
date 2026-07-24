import assert from 'node:assert/strict';
import {
  getStatusDocumentStats,
  renderStatusIndicators,
  renderStatusMeta
} from '../lib/status/renderers.js';

const indicators = renderStatusIndicators({
  statusMessage: 'Saved <ok>',
  saveState: 'saved'
});
assert.match(indicators, /data-save-now/);
assert.match(indicators, /已自动保存/);
assert.match(indicators, /Saved &lt;ok&gt;/);
assert.doesNotMatch(indicators, /当前资料|笔记 \d|目录 \d/);

const meta = renderStatusMeta({
  dataMode: 'api',
  markdown: '# 标题\n正文 [链接](https://example.com)',
  view: { mode: 'focus', showSourceEditor: true, showRightSidebar: false }
});
assert.match(meta, /字数 4/);
assert.match(meta, /行数 2/);
assert.doesNotMatch(meta, /大纲/);
assert.match(meta, /链接 1/);
assert.match(meta, /data-status-action="toggle-source-editor" data-active="true"/);
assert.match(meta, /data-status-action="toggle-right-sidebar" data-active="false"/);
assert.match(meta, /data-status-action="toggle-focus"[\s\S]*data-active="true"[\s\S]*退出专注模式/);
assert.match(meta, /云端已连接/);

assert.match(
  renderStatusMeta({
    dataMode: 'api'
  }),
  /云端已连接/
);

assert.match(
  renderStatusMeta({
    dataMode: 'local',
    currentSpaceId: 'ignored'
  }),
  /本地优先/
);

assert.deepEqual(getStatusDocumentStats('# A\n正文\n[[内部]]'), {
  characters: 9,
  lines: 3,
  links: 1
});

console.log('ok - status renderers escape and label workspace state');
