import path from 'node:path';
import { createAttachmentTransfer } from '../../api/src/modules/sync/attachment-transfer.js';
import { createAppContext } from '../../api/src/app.factory.js';
import { createServer } from '../../api/src/server.js';
import { createSqliteDataStore } from './sqlite-data-store.mjs';
import { createSyncEngine } from './sync-engine.mjs';
import { createOptionalAiRuntime } from '../../api/src/modules/ai/runtime.js';
import { reviewedDeepSeekPriceProfile } from '../../api/src/modules/ai/reviewed-price-profile.js';
import { createRemoteBudgetAuthority } from '../../api/src/modules/ai/remote-budget-authority.js';

/** 每次切换资料库都重建应用服务，避免 repository 留存旧 SQLite/内存引用。 */
export function createRuntimeServices({ dataDirectory, logger = console, syncOptions = {}, credentialSource = null }) {
    const store = createSqliteDataStore(path.join(dataDirectory, 'local.sqlite'));
    try {
    const context = createAppContext({
      dataStore: store, storageRootDir: dataDirectory,
      uploadsDir: path.join(dataDirectory, 'uploads'), ownerId: 'demo'
    });
    // 复用业务规则，但本地更新时间不能在同一毫秒内重复。
    const noteService = context.modules.knowledge.noteService;
    const updateNote = noteService.updateNote.bind(noteService);
    noteService.updateNote = (id, updates) => updateNote(id, {
      ...updates,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(noteService.getNote(id, { includeDeleted: true }).updatedAt) + 1)).toISOString()
    });
    // 保留本地来源版本的稳定 ID；列表对相同正文去重，优先展示已确认的云端版本。
    const listVersions = context.http.knowledge.listNoteVersions;
    context.http.knowledge.listNoteVersions = (...args) => store.readSync(db => {
      const remoteIds = new Set(db.prepare("SELECT id FROM sync_base WHERE collection = 'noteVersions' AND payload != 'null'").all().map(row => row.id));
      const versions = listVersions(...args);
      if (!Array.isArray(versions)) return versions;
      const selected = new Map();
      for (const version of versions) {
        const previous = selected.get(version.contentHash);
        if (!previous || (!remoteIds.has(previous.id) && remoteIds.has(version.id))) selected.set(version.contentHash, version);
      }
      return versions.filter(version => selected.get(version.contentHash)?.id === version.id);
    });
    const entityTransfer = createAttachmentTransfer({ allowRepair: true, uploadsDir: path.join(dataDirectory, 'uploads'), storageRootDir: dataDirectory });
    const renameAttachment = context.http.storage.updateAttachment;
    context.http.storage.updateAttachment = (params, body) => {
      const attachment = store.state.attachments.find(item => item.id === params.id);
      if (attachment) entityTransfer.read(attachment);
      return renameAttachment(params, body);
    };
    context.http.storage.deleteAttachment = params => store.runTransaction(() => {
      const reference = `/api/storage/attachments/${params.id}/content`;
      if ([...store.state.notes.map(note => note.rawMarkdown), ...store.state.noteVersions.map(version => version.content)].some(content => content.includes(reference))) {
        const error = new Error('正文或历史版本仍引用此附件，不能删除。'); error.code = 'ATTACHMENT_REFERENCED'; error.statusCode = 409; throw error;
      }
      const index = store.state.attachments.findIndex(item => item.id === params.id);
      if (index < 0) throw new Error('附件不存在。');
      const [attachment] = store.state.attachments.splice(index, 1);
      // 同步确认与备份完成前保留文件，删除只产生元数据墓碑。
      store.flush(); return attachment;
    });
    const sync = createSyncEngine(store, { ...syncOptions, noteService, entityTransfer });
    const modelSettings = credentialSource ?? {
      credentialReference: async () => null,
      resolveCredential: async () => { throw new Error('请先在 Mac 应用设置中配置模型。'); }
    };
    context.ai = createOptionalAiRuntime({ modelSettings, repository: store.aiRepository, accessStore: store.aiAccessStore,
      conversationStore: store.aiConversationStore,
      budgetAuthority: createRemoteBudgetAuthority((route, body) => sync.budgetRequest(route, body)),
      priceProfile: reviewedDeepSeekPriceProfile, allowExternal: process.env.KNOWRA_AI_EGRESS_ENABLED !== '0',
      contextSources: { ...context.modules.knowledge.repositories,
        spaceRepository: context.modules.knowledge.repositories.knowledgeSpaceRepository, ownerId: 'demo' } },
      { enabled: !store.aiRuntimeError && process.env.KNOWRA_AI_ENABLED !== '0',
        unavailableReason: store.aiRuntimeError ? 'AI 私有存储无效，核心资料仍可使用。' : 'AI 功能已关闭。', logger });
    context.aiOwnerId = 'demo';
    context.aiLocation = 'local';
    const recoverAi = Promise.all([
      context.ai?.conversationStore?.recoverInterrupted?.(),
      context.ai?.worker?.recover?.()
    ]).catch(error => {
      logger.warn?.('AI task recovery deferred until cloud budget is available', { code: error.code ?? 'AI_BUDGET_UNAVAILABLE' });
    });
    const configureSync = sync.configure.bind(sync);
    sync.configure = async input => {
      const result = await configureSync(input);
      await context.ai?.worker?.recover?.().catch(error => {
        logger.warn?.('AI task recovery deferred', { code: error.code ?? 'AI_RECOVERY_FAILED' });
      });
      return result;
    };
    const apiServer = createServer({ appContext: context, logger });
    const handleApi = apiServer.listeners('request')[0];
    return { store, sync, handleApi, recoverAi, closeAi: () => context.ai?.worker?.close?.() ?? Promise.resolve() };
    } catch (error) { store.close(); throw error; }
}
