import assert from 'node:assert/strict';
import {
  getRailLabel,
  renderModuleRail,
  renderRailIcon
} from '../lib/shell/rail-renderers.js';

assert.equal(getRailLabel('knowledge'), '知识');
assert.equal(getRailLabel('materials'), '资料');
assert.equal(getRailLabel('training'), '训练');
assert.equal(getRailLabel('learning'), '学习档案');
assert.equal(getRailLabel('paper'), '题库');
assert.equal(getRailLabel('unknown <module>'), 'unknown <module>');

const html = renderModuleRail([
  { key: 'knowledge', active: true },
  { key: 'unknown <module>', active: false }
]);

assert.match(html, /class="rail-item"/);
assert.match(html, /data-active="true"/);
assert.match(html, /aria-label="知识"/);
assert.match(html, /rail-item-label">知识</);
assert.match(html, /data-active="false"/);
assert.match(html, /aria-label="unknown &lt;module&gt;"/);
assert.match(html, /rail-item-label">unknown &lt;module&gt;</);
assert.match(html, /rail-item-icon/);
assert.match(html, /phosphor-books-duotone\.svg/);
assert.doesNotMatch(html, /<svg/);

assert.match(renderRailIcon('paper'), /phosphor-exam-duotone\.svg/);
assert.equal(renderRailIcon('settings'), '');
assert.equal(renderRailIcon('missing'), '');

console.log('ok - shell rail renderers produce stable module rail markup');
