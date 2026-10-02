import type { RequestJson } from './client.js';
import { getData, isRecord } from './response.js';

export const COMMAND_SEARCH_QUERY_LIMIT = 200;
export const COMMAND_SEARCH_RESULT_LIMIT = 30;
export const COMMAND_SEARCH_SNIPPET_LIMIT = 220;

export interface CommandNoteSearchInput {
  query: string;
  spaceId: string;
}

/** 命令面板的投影；不携带 Markdown 或完整 plainText。 */
export interface CommandNoteSearchHit {
  id: string;
  title: string;
  folderId: string | null;
  snippet: string;
}

export type CommandNoteSearcher = (input: CommandNoteSearchInput) => Promise<CommandNoteSearchHit[]>;

export async function requestCommandNoteSearch(requestJson: RequestJson, input: CommandNoteSearchInput): Promise<CommandNoteSearchHit[]> {
  if (!input.spaceId.trim() || input.spaceId.length > COMMAND_SEARCH_QUERY_LIMIT) throw new Error('请选择有效的当前空间后搜索。');
  if (input.query.length > COMMAND_SEARCH_QUERY_LIMIT) throw new Error('搜索关键字最多 200 字符。');
  const params = [
    ['query', input.query.trim()], ['spaceId', input.spaceId.trim()],
    ['limit', COMMAND_SEARCH_RESULT_LIMIT], ['result', 'command']
  ].map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&');
  const data = getData<unknown>(await requestJson(`/api/knowledge/search/notes?${params}`));
  if (!Array.isArray(data) || data.length > COMMAND_SEARCH_RESULT_LIMIT || !data.every(validHit)) {
    throw new Error('正文搜索返回无效，请重试。');
  }
  return data.map(hit => ({ id: hit.id, title: hit.title, folderId: hit.folderId, snippet: hit.snippet }));
}

function validHit(value: unknown): value is CommandNoteSearchHit {
  return isRecord(value) && Object.keys(value).length === 4
    && typeof value.id === 'string' && Boolean(value.id)
    && typeof value.title === 'string'
    && (value.folderId === null || typeof value.folderId === 'string')
    && typeof value.snippet === 'string' && value.snippet.length <= COMMAND_SEARCH_SNIPPET_LIMIT;
}
