import path from 'node:path';
import { createAttachmentTransfer } from '../../api/src/modules/sync/attachment-transfer.js';
import { createAppContext } from '../../api/src/app.factory.js';
import { createServer } from '../../api/src/server.js';
import { createSqliteDataStore } from './sqlite-data-store.mjs';
import { createSyncEngine } from './sync-engine.mjs';

/** 每次切换资料库都重建应用服务，避免 repository 留存旧 SQLite/内存引用。 */
export function createRuntimeServices({ dataDirectory, logger = console, syncOptions = {} }) {
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
    const apiServer = createServer({ appContext: context, logger });
    const handleApi = apiServer.listeners('request')[0];
    const sync = createSyncEngine(store, { ...syncOptions, noteService, entityTransfer });
    return { store, sync, handleApi };
    } catch (error) { store.close(); throw error; }
}
