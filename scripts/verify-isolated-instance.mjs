#!/usr/bin/env node
import assert from 'node:assert/strict';
const [origin, instanceId, mode] = process.argv.slice(2);
assert(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin ?? ''), '自动合成写入只允许明确回环实例');
assert(/^[a-z][a-z0-9_]{1,24}$/.test(instanceId ?? ''));
const get = async route => { const response = await fetch(origin + route); assert(response.ok); return (await response.json()).data; };
const health = await get('/api/health');
assert.equal(health.testInstance, instanceId); assert.equal(health.syntheticOnly, true);
const page = await fetch(origin); assert((await page.text()).includes('测试环境 · 仅合成资料'));
assert.equal((await fetch(origin + '/api/ai/model-settings')).status, 503);
const title = `合成部署自检 ${instanceId}`;
if (mode === '--verify-existing') {
  const notes = await get('/api/knowledge/notes');
  assert(notes.some(note => note.title === title), '重启保留此前实际写入的合成笔记');
} else {
  const spaceResponse = await fetch(origin + '/api/knowledge/spaces/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert(spaceResponse.ok); const space = (await spaceResponse.json()).data;
  const response = await fetch(origin + '/api/knowledge/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceId: space.id, title, rawMarkdown: '仅合成部署验收，未导入真实资料。' }) });
  assert.equal(response.status, 201);
}
console.log('独立实例标识、合成笔记、测试提示及AI关闭核验通过。');
