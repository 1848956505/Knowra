import { expect, it, vi } from 'vitest';
import { createWorkspaceApi } from '../src/index.js';

it('核心来源摘要只读取已编码知识ID，不依赖任务接口或开启生成', async () => {
  const id = '知识/1', result = { artifactId: id, state: 'absent', record: null, sources: [] };
  const requestJson = vi.fn().mockResolvedValue({ data: result });
  await expect(createWorkspaceApi({ requestJson }).getKnowledgeProvenance!(id)).resolves.toEqual(result);
  expect(requestJson).toHaveBeenCalledExactlyOnceWith('/api/knowledge/items/%E7%9F%A5%E8%AF%86%2F1/provenance');
});

it.each([
  { artifactId: 'other', state: 'absent', record: null, sources: [] },
  { artifactId: 'k1', state: 'future', record: null, sources: [] },
  { artifactId: 'k1', state: 'recorded', record: null, sources: [] },
  { artifactId: 'k1', state: 'legacy-unavailable', record: { artifactId: 'other', state: 'legacy-unavailable' }, sources: [] },
  { artifactId: 'k1', state: 'absent', record: { provider: 'real' }, sources: [] }
])('拒绝错产物或不完整的来源投影 %#', async result => {
  const requestJson = vi.fn().mockResolvedValue({ data: result });
  await expect(createWorkspaceApi({ requestJson }).getKnowledgeProvenance!('k1')).rejects.toThrow('知识来源摘要返回无效');
});
