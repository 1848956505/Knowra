import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ResponseWriter } from '../src/http/response.ts';
import {
  handleWorkspaceRoute,
  type WorkspaceRouteContext,
  type WorkspaceRouteKnowledge,
  type WorkspaceRouteQuery
} from '../src/modules/knowledge/http/workspace-routes.ts';
import { handleWorkspaceRoute as workspaceBridge } from '../src/modules/knowledge/http/workspace-routes.js';
import {
  handleNoteVersionRoute,
  type NoteVersionRouteContext,
  type NoteVersionRouteKnowledge,
  type NoteVersionRouteParams,
  type NoteVersionDetailRouteParams,
  type NoteVersionRouteQuery
} from '../src/modules/knowledge/http/note-version-routes.ts';
import { handleNoteVersionRoute as versionBridge } from '../src/modules/knowledge/http/note-version-routes.js';
import { createKnowledgeHttpHandlers } from '../src/modules/knowledge/http/knowledge-handlers.js';
import { createPostgresKnowledgeHttpHandlers } from '../src/modules/knowledge/http/postgres-async-handlers.js';
import { handleKnowledgeRoute } from '../src/modules/knowledge/http/knowledge-routes.js';
import { createKnowledgeWorkspaceQuery } from '../src/modules/knowledge/application/knowledge-workspace-query-service.ts';
import { createTrainingWorkspaceQuery } from '../src/modules/knowledge/application/training-workspace-query-service.ts';
import { createReviewQueueQuery } from '../src/modules/knowledge/application/review-queue-query-service.ts';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

declare const request: IncomingMessage;
declare const response: ServerResponse;
declare const url: URL;
declare const local: ReturnType<typeof createKnowledgeHttpHandlers>;
declare const postgres: ReturnType<typeof createPostgresKnowledgeHttpHandlers>;
declare const knowledgeQuery: ReturnType<typeof createKnowledgeWorkspaceQuery>;
declare const trainingQuery: ReturnType<typeof createTrainingWorkspaceQuery>;
declare const reviewQuery: ReturnType<typeof createReviewQueueQuery>;

// 使用真实工厂返回值、Node request/response 和 URL，而不是同名手写替身。
const _writer: ResponseWriter = response;
const _localWorkspace: WorkspaceRouteKnowledge = local;
const _postgresWorkspace: WorkspaceRouteKnowledge = postgres;
const _localVersion: NoteVersionRouteKnowledge = local;
const _postgresVersion: NoteVersionRouteKnowledge = postgres;
const actualQueries: WorkspaceRouteKnowledge = {
  getKnowledgeOverview: knowledgeQuery.getKnowledgeOverview,
  getTrainingOverview: trainingQuery.getTrainingOverview,
  listReviewQueue: reviewQuery.listReviewQueue
};
const localContext = { request, response, url, knowledge: local };
const postgresContext = { request, response, url, knowledge: postgres };
const _localWorkspaceCall = handleWorkspaceRoute(localContext);
const _postgresWorkspaceCall = workspaceBridge(postgresContext);
const _localVersionCall = handleNoteVersionRoute(localContext);
const _postgresVersionCall = versionBridge(postgresContext);
const _routerLocal = handleKnowledgeRoute(localContext);
const _routerPostgres = handleKnowledgeRoute(postgresContext);
const _queryCall = handleWorkspaceRoute({ request, response, url, knowledge: actualQueries });

const synchronous: WorkspaceRouteKnowledge = {
  getKnowledgeOverview: () => Symbol('overview'),
  getTrainingOverview: () => ({ historical: true }),
  listReviewQueue: query => query.limit
};
const asynchronous: WorkspaceRouteKnowledge = {
  getKnowledgeOverview: async () => 1n,
  getTrainingOverview: () => Promise.resolve(undefined),
  listReviewQueue: async query => query
};
const versions: NoteVersionRouteKnowledge = {
  previewNoteVersionPrune: params => params.id,
  listNoteVersions: async (params, query) => ({ params, query }),
  getNoteVersion: params => Promise.resolve(params.versionId)
};
const _sync = handleWorkspaceRoute({ request, response, url, knowledge: synchronous });
const _async = handleWorkspaceRoute({ request, response, url, knowledge: asynchronous });
const _versions = handleNoteVersionRoute({ request, response, url, knowledge: versions });
const _minimal = handleWorkspaceRoute({ request: {}, response, url: {}, knowledge: synchronous });
const _customMethod = handleWorkspaceRoute({
  request: { method: Symbol('method') },
  response,
  url,
  knowledge: synchronous
});
const customUrl = {
  get pathname() {
    return {
      match: (_pattern: RegExp): unknown => ({ 1: { toString: () => 'note%2Fid' }, 2: Symbol('capture') })
    };
  },
  searchParams: {
    entries: () => [
      [Symbol('query'), { historical: true }],
      ['limit', 4]
    ]
  }
};
const _customVersion = handleNoteVersionRoute({ request, response, url: customUrl, knowledge: versions });
const _customWorkspace = handleWorkspaceRoute({ request, response, url: customUrl, knowledge: synchronous });
const _boxedPath = handleNoteVersionRoute({
  request,
  response,
  url: { pathname: new String('/path') },
  knowledge: versions
});
const thenable: WorkspaceRouteKnowledge = {
  getKnowledgeOverview: () => ({ then: (resolve: (value: unknown) => unknown) => resolve({ arbitrary: true }) }),
  getTrainingOverview: () => null,
  listReviewQueue: () => undefined
};
const _thenable = handleWorkspaceRoute({ request, response, url, knowledge: thenable });
declare const query: WorkspaceRouteQuery;
declare const _versionQuery: NoteVersionRouteQuery;
declare const workspacePort: WorkspaceRouteKnowledge;
declare const versionPort: NoteVersionRouteKnowledge;
const _responseData = workspacePort.getKnowledgeOverview();
const _awaitedData = Promise.resolve(_responseData);
const _previewData = versionPort.previewNoteVersionPrune({ id: 'n' });
const _listData = versionPort.listNoteVersions({ id: 'n' }, query);
const _detailData = versionPort.getNoteVersion({ id: 'n', versionId: 'v' });

export type ReadonlyRouteContracts = [
  Assert<Equal<typeof workspaceBridge, typeof handleWorkspaceRoute>>,
  Assert<Equal<typeof versionBridge, typeof handleNoteVersionRoute>>,
  Assert<Equal<ReturnType<typeof handleWorkspaceRoute>, Promise<boolean>>>,
  Assert<Equal<ReturnType<typeof handleNoteVersionRoute>, Promise<boolean>>>,
  Assert<Equal<Parameters<typeof handleWorkspaceRoute>, [WorkspaceRouteContext]>>,
  Assert<Equal<Parameters<typeof handleNoteVersionRoute>, [NoteVersionRouteContext]>>,
  Assert<Equal<WorkspaceRouteContext['response'], ResponseWriter>>,
  Assert<Equal<NoteVersionRouteContext['response'], ResponseWriter>>,
  Assert<Equal<WorkspaceRouteContext['request']['method'], unknown>>,
  Assert<Equal<WorkspaceRouteContext['url']['pathname'], unknown>>,
  Assert<Equal<WorkspaceRouteContext['url']['searchParams'], unknown>>,
  Assert<Equal<ReturnType<NoteVersionRouteContext['url']['pathname']['match']>, unknown>>,
  Assert<Equal<Parameters<NoteVersionRouteContext['url']['pathname']['match']>, [RegExp]>>,
  Assert<Equal<Parameters<WorkspaceRouteKnowledge['listReviewQueue']>, [WorkspaceRouteQuery]>>,
  Assert<Equal<Parameters<NoteVersionRouteKnowledge['previewNoteVersionPrune']>, [NoteVersionRouteParams]>>,
  Assert<
    Equal<Parameters<NoteVersionRouteKnowledge['listNoteVersions']>, [NoteVersionRouteParams, NoteVersionRouteQuery]>
  >,
  Assert<Equal<Parameters<NoteVersionRouteKnowledge['getNoteVersion']>, [NoteVersionDetailRouteParams]>>,
  Assert<Equal<NoteVersionRouteParams['id'], string>>,
  Assert<Equal<NoteVersionDetailRouteParams['versionId'], string>>,
  Assert<Equal<WorkspaceRouteQuery['arbitrary'], NoteVersionRouteQuery['arbitrary']>>,
  Assert<Equal<typeof query.limit, unknown>>,
  Assert<Equal<typeof query.toString, unknown>>,
  Assert<Equal<typeof _versionQuery.constructor, unknown>>,
  Assert<Equal<typeof _responseData, unknown>>,
  Assert<Equal<Awaited<typeof _awaitedData>, unknown>>,
  Assert<Equal<typeof _previewData, unknown>>,
  Assert<Equal<typeof _listData, unknown>>,
  Assert<Equal<typeof _detailData, unknown>>,
  Assert<Equal<IsAny<typeof _responseData>, false>>,
  Assert<Equal<IsAny<typeof _listData>, false>>,
  Assert<Equal<typeof _localWorkspaceCall, Promise<boolean>>>,
  Assert<Equal<typeof _postgresWorkspaceCall, Promise<boolean>>>,
  Assert<Equal<typeof _localVersionCall, Promise<boolean>>>,
  Assert<Equal<typeof _postgresVersionCall, Promise<boolean>>>,
  Assert<Equal<typeof _routerLocal, Promise<boolean>>>,
  Assert<Equal<typeof _routerPostgres, Promise<boolean>>>,
  Assert<Equal<typeof _customVersion, Promise<boolean>>>,
  Assert<Equal<typeof _customWorkspace, Promise<boolean>>>
];

// 以下负例单独去掉注释重编译，逐行确认真正报错，不把 JS 既有 any 当作安全证据。
// @ts-expect-error 路由总是异步。
const _syncBoolean: boolean = _sync;
// @ts-expect-error 响应没有保证 DTO。
const _dto: { items: string[] } = _responseData;
// @ts-expect-error 响应 unknown 不能读取字段。
const _items = _responseData.items;
// @ts-expect-error 版本响应同样没有保证数组。
const _array: string[] = _listData;
// @ts-expect-error 查询值不是已验证字符串。
const _limit: string = query.limit;
// @ts-expect-error 查询可以覆盖 Object 原型成员。
const _toString = query.toString();
const _narrowReview: WorkspaceRouteKnowledge = {
  ...synchronous,
  // @ts-expect-error 不允许字符串值过窄的查询消费者。
  listReviewQueue: (_query: Record<string, string>) => []
};
// @ts-expect-error 不允许要求 limit 必填。
const _requiredLimit: WorkspaceRouteKnowledge = { ...synchronous, listReviewQueue: (_query: { limit: string }) => [] };
// @ts-expect-error overview 调用不传参数。
const _overviewArgument: WorkspaceRouteKnowledge = { ...synchronous, getKnowledgeOverview: (_id: string) => [] };
// @ts-expect-error 不允许丢失必需回调。
const _missingOverview: WorkspaceRouteKnowledge = { listReviewQueue: () => [], getTrainingOverview: () => [] };
// @ts-expect-error 回调必须可调用。
const _nonCallable: WorkspaceRouteKnowledge = { ...synchronous, getTrainingOverview: 42 };
const _literalId: NoteVersionRouteKnowledge = {
  ...versions,
  // @ts-expect-error ID 字面量比路由实际字符串更窄。
  previewNoteVersionPrune: (_params: { id: 'fixed' }) => []
};
const _owner: NoteVersionRouteKnowledge = {
  ...versions,
  // @ts-expect-error 参数不含客户端 owner。
  listNoteVersions: (_params: { id: string; ownerId: string }) => []
};
const _versionNarrowQuery: NoteVersionRouteKnowledge = {
  ...versions,
  // @ts-expect-error 列表查询值不保证字符串。
  listNoteVersions: (_params: NoteVersionRouteParams, _query: Record<string, string>) => []
};
const _literalVersion: NoteVersionRouteKnowledge = {
  ...versions,
  // @ts-expect-error detail 的 versionId 是完整字符串而非枚举。
  getNoteVersion: (_params: { id: string; versionId: 'fixed' }) => []
};
const _extraArgument: NoteVersionRouteKnowledge = {
  ...versions,
  // @ts-expect-error 不允许要求额外第三个参数。
  listNoteVersions: (_params: NoteVersionRouteParams, _query: NoteVersionRouteQuery, _owner: string) => []
};
const _narrowMethod: NoteVersionRouteKnowledge = {
  ...versions,
  // @ts-expect-error 方法语法构造的过窄消费者也必须被函数属性端口拒绝。
  getNoteVersion(_params: { id: 'fixed'; versionId: string }) {
    return [];
  }
};
const _previewVersion: NoteVersionRouteKnowledge = {
  ...versions,
  // @ts-expect-error preview 不提供版本 ID。
  previewNoteVersionPrune: (_params: NoteVersionDetailRouteParams) => []
};
// @ts-expect-error route 参数 ID 必须为解码后的字符串。
const _numberId: NoteVersionRouteParams = { id: 42 };
// @ts-expect-error detail 必须包含 versionId。
const _missingVersion: NoteVersionDetailRouteParams = { id: 'n' };
// @ts-expect-error 类型层不把不能 match 的路径宣称为有效上下文。
const _noMatch: NoteVersionRouteContext = { request, response, url: { pathname: 42 }, knowledge: versions };
const _wrongMatch: NoteVersionRouteContext = {
  request,
  response,
  // @ts-expect-error 自定义 match 必须能接受真实 RegExp，而非字符串。
  url: { pathname: { match: (_pattern: string) => [] } },
  knowledge: versions
};
// @ts-expect-error Node 响应仍须具备共享 writeHead/end 端口。
const _missingResponse: WorkspaceRouteContext = { request, response: {}, url, knowledge: synchronous };
// @ts-expect-error 只读上下文并非提供所有未迁移知识路由的写操作。
const _write = workspacePort.createNote({ title: 'not provided' });
