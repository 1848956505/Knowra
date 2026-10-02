import { describe, expect, it, vi } from 'vitest';
import { createApiClient, createWorkspaceApi } from '../src/index.js';

const hit = { id: 'note/合成', title: '合成资料', folderId: null, snippet: '中文正文命中' };

describe('命令正文搜索契约', () => {
  it('按空间传递中文子串和固定上限，仅接受有界投影', async () => {
    const requestJson = vi.fn().mockResolvedValue({ data: [hit] });
    const api = createWorkspaceApi({ requestJson });
    await expect(api.searchCommandNotes!({ query: ' 中文 & 正文 ', spaceId: 'space/合成' })).resolves.toEqual([hit]);
    const url = new URL(requestJson.mock.calls[0][0], 'http://contract.test');
    expect(url.pathname).toBe('/api/knowledge/search/notes');
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: '中文 & 正文', spaceId: 'space/合成', limit: '30', result: 'command' });
  });

  it('保留笔记索引页的 includeDeleted=true ID 查询', async () => {
    const requestJson = vi.fn().mockResolvedValue({ data: ['live', 'deleted'] });
    await expect(createWorkspaceApi({ requestJson }).searchNoteIds({ query: '正文', spaceId: 'space' })).resolves.toEqual(['live', 'deleted']);
    const url = new URL(requestJson.mock.calls[0][0], 'http://contract.test');
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: '正文', spaceId: 'space', includeDeleted: 'true', result: 'ids' });
  });

  it('对空或过长空间、过长输入拒绝发出请求，边界 200 字符可搜索', async () => {
    const requestJson = vi.fn().mockResolvedValue({ data: [] });
    const search = createWorkspaceApi({ requestJson }).searchCommandNotes!;
    for (const input of [{ query: '正文', spaceId: '' }, { query: '正文', spaceId: ' '.repeat(10) },
      { query: '正文', spaceId: 's'.repeat(201) }, { query: '文'.repeat(201), spaceId: 'space' }]) {
      await expect(search(input)).rejects.toThrow();
    }
    expect(requestJson).not.toHaveBeenCalled();
    await expect(search({ query: '文'.repeat(200), spaceId: 'space' })).resolves.toEqual([]);
  });

  it.each([
    {}, { data: {} }, { data: null }, { data: [{ ...hit, plainText: '不应携带的全文' }] },
    { data: [{ ...hit, rawMarkdown: '不应携带的原文' }] }, { data: [{ ...hit, snippet: '文'.repeat(221) }] },
    { data: [{ ...hit, id: '' }] }, { data: [{ ...hit, folderId: 3 }] }, { data: Array(31).fill(hit) }
  ])('不把无效响应或越界全文载荷当作空搜索成功 %#', async payload => {
    const api = createWorkspaceApi({ requestJson: vi.fn().mockResolvedValue(payload) });
    await expect(api.searchCommandNotes!({ query: '正文', spaceId: 'space' })).rejects.toThrow('正文搜索返回无效');
  });

  it('真实客户端保留 HTTP 失败的状态、错误码和文案', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503,
      json: async () => ({ error: { code: 'SEARCH_UNAVAILABLE', message: '合成服务不可用' } }) });
    const api = createWorkspaceApi(createApiClient({ fetchImpl }));
    await expect(api.searchCommandNotes!({ query: '中文', spaceId: 'space' })).rejects.toMatchObject({
      status: 503, code: 'SEARCH_UNAVAILABLE', message: '合成服务不可用'
    });
  });
});
