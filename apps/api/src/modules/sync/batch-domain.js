import { buildCreateNoteDto } from '../knowledge/application/dto/note.dto.js';
import { buildCreateFolderDto } from '../knowledge/application/dto/folder.dto.js';
import { buildCreateTagDto } from '../knowledge/application/dto/tag.dto.js';
import { buildCreateTagGroupDto } from '../knowledge/application/dto/tag-group.dto.js';
import { reconcileSyncedSourceStates } from '../../infrastructure/local-data-relations.js';
import { createHash } from 'node:crypto';
import { Note } from '../knowledge/domain/note.js';
import { Folder } from '../knowledge/domain/folder.js';
import { Tag } from '../knowledge/domain/tag.js';
import { TagGroup } from '../knowledge/domain/tag-group.js';
import { ContentAnnotation } from '../knowledge/domain/content-annotation.js';
import { createContentAnnotationService } from '../knowledge/application/content-annotation-service.js';
import { createInMemoryContentAnnotationRepository } from '../knowledge/infrastructure/content-annotation-repository.js';
import { createInMemoryNoteRepository } from '../knowledge/infrastructure/note-repository.js';
import { createInMemoryNoteVersionRepository } from '../knowledge/infrastructure/note-version-repository.js';
import { createInMemoryAnnotationRevisionRepository } from '../knowledge/infrastructure/annotation-support-repositories.js';
import { validatePersistedLocalState, createPersistedLocalDocument } from '../../infrastructure/local-data-schema.js';
import { assertNoInsecureImageUrls } from '../knowledge/application/note-content-policy.js';
import { calculateContentHash, resolveAnchor } from '@study-accelerator/content-anchor';
import { sameEntity, IMMUTABLE_COLLECTIONS, referencesFor } from './entity-contract.js';
import { syncError } from './journal.js';

const sha = text => createHash('sha256').update(text).digest('hex');
const builders = { notes: buildCreateNoteDto, folders: buildCreateFolderDto, tags: buildCreateTagDto, tagGroups: buildCreateTagGroupDto };
const constructors = { notes: Note, folders: Folder, tags: Tag, tagGroups: TagGroup, contentAnnotations: ContentAnnotation };
const replace = (state, collection, id, value) => {
  const index = state[collection].findIndex(item => item.id === id);
  if (index >= 0) state[collection].splice(index, 1);
  if (value) state[collection].push(value);
};

/** 只在内存中构造并校验完整事务后像；不做文件或网络 IO。 */
export function prepareBatchState(before, changes, ownerId, preparedAttachments = {}) {
  let state = structuredClone(before);
  const aliases = {};
  const now = new Date().toISOString();
  for (const change of changes) {
    const { collection, id } = change;
    const old = before[collection].find(item => item.id === id);
    let value = structuredClone(change.value);
    if (value && value.id !== id) throw syncError('SYNC_ENTITY_INVALID', '实体 ID 与操作不一致。', 422);
    if (IMMUTABLE_COLLECTIONS.has(collection) && old && !sameEntity(collection, old, value)) throw syncError('SYNC_IMMUTABLE', '历史版本与修订记录不可覆盖或删除。', 422);
    if (old && value && ['tags', 'tagGroups'].includes(collection) && (Boolean(value.isSystem) !== Boolean(old.isSystem) || (value.code ?? null) !== (old.code ?? null))) throw syncError('SYSTEM_TAG_PROTECTED', '标签的系统标识不能改写。', 422);
    if (old?.isSystem && (!value || value.spaceId !== old.spaceId || value.isSystem !== old.isSystem || value.code !== old.code || (collection === 'tags' && value.groupId !== old.groupId))) throw syncError('SYSTEM_TAG_PROTECTED', '系统标签和分组不能删除或改换归属。', 422);
    if (collection === 'spaces' && (!value || value.userId !== ownerId || (old && old.userId !== ownerId))) throw syncError('SYNC_OWNER_INVALID', '空间不属于当前资料库。', 422);
    if (old && value) for (const field of ['spaceId', 'noteId', 'annotationId', 'parentAnnotationId']) {
      if (field in old && value[field] !== old[field]) throw syncError('SYNC_IDENTITY_CHANGED', '不能更改实体所属对象。', 422);
    }
    if (value) {
      if (builders[collection]) value = { ...value, ...builders[collection](value) };
      if (collection === 'notes') {
        assertNoInsecureImageUrls(value.rawMarkdown);
        value = { ...value, plainText: undefined, internalLinks: undefined, contentHash: sha(value.rawMarkdown) };
      }
      if (constructors[collection]) value = { ...new constructors[collection](value) };
      if (!IMMUTABLE_COLLECTIONS.has(collection)) {
        value.createdAt = old?.createdAt ?? now;
        if ('updatedAt' in value) value.updatedAt = new Date(Math.max(Date.now(), Date.parse(old?.updatedAt ?? 0) + 1 || 0)).toISOString();
      }
      if (collection === 'attachments') {
        if (old && (old.sha256 !== value.sha256 || old.noteId !== value.noteId)) throw syncError('SYNC_ATTACHMENT_IMMUTABLE', '附件内容不可覆盖，请插入新附件。', 422);
        const prepared = preparedAttachments[id];
        if (!prepared || prepared.sha256 !== value.sha256 || prepared.size !== value.size || prepared.fileName !== value.fileName) throw syncError('ATTACHMENT_NOT_READY', '附件尚未完成传输与校验。', 409);
        value = { ...value, storagePath: prepared.storagePath, status: 'ready', verifiedAt: now };
      }
    }
    replace(state, collection, id, value);
  }
  // 同正文的版本沿用云端稳定 ID，重写本批标注中的版本引用。
  const byHash = new Map(before.noteVersions.map(version => [`${version.noteId}:${version.contentHash}`, version.id]));
  state.noteVersions = state.noteVersions.filter(version => {
    const key = `${version.noteId}:${version.contentHash}`;
    const canonical = byHash.get(key);
    if (canonical && canonical !== version.id) { aliases[version.id] = canonical; return false; }
    byHash.set(key, version.id); return true;
  });
  function remap(value) {
    if (Array.isArray(value)) return value.map(remap);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'noteVersionId' && aliases[child] ? aliases[child] : remap(child)]));
  }
  for (const collection of ['contentAnnotations', 'annotationExclusions', 'annotationRevisions']) state[collection] = state[collection].map(remap);
  for (const change of changes.filter(item => item.collection === 'contentAnnotations' && item.value)) {
    const annotation = state.contentAnnotations.find(item => item.id === change.id);
    const note = state.notes.find(item => item.id === annotation.noteId);
    const origin = annotation.originSnapshot;
    const originVersion = state.noteVersions.find(item => item.id === origin?.noteVersionId);
    if (!originVersion || originVersion.noteId !== annotation.noteId || originVersion.contentHash !== origin?.contentHash) throw syncError('ANNOTATION_VERSION_CONFLICT', '原始标注快照缺少对应版本。', 422);
    const old = before.contentAnnotations.find(item => item.id === annotation.id);
    if (old && annotation.revision < old.revision) throw syncError('ANNOTATION_REVISION_CONFLICT', '标注修订不能倒退。');
    if (old && !sameEntity('contentAnnotations', { originSnapshot: old.originSnapshot }, { originSnapshot: origin })) throw syncError('SYNC_IMMUTABLE', '标注原始快照不可改写。', 422);
    if (annotation.schemaVersion !== 2) throw syncError('ANNOTATION_UPGRADE_REQUIRED', '请先升级旧版标注。', 422);
    if (annotation.anchorStatus === 'resolved') {
      const version = state.noteVersions.find(item => item.id === annotation.noteVersionId);
      if (!version || version.noteId !== annotation.noteId || version.contentHash !== annotation.noteContentHash) throw syncError('ANNOTATION_VERSION_CONFLICT', '标注来源版本不匹配。', 422);
      const resolved = resolveAnchor(version.content, annotation.anchor);
      if (resolved.status !== 'resolved' || resolved.quoteText !== annotation.quoteText) throw syncError('ANNOTATION_ANCHOR_UNRESOLVED', '标注无法在来源版本中定位。', 422);
    }
    if (!note) throw syncError('DEPENDENCY_MISSING', '标注引用的笔记不存在。');
  }
  const revisionKeys = new Set();
  for (const revision of state.annotationRevisions) {
    const key = `${revision.annotationId}:${revision.revision}`;
    if (revisionKeys.has(key)) throw syncError('ANNOTATION_REVISION_CONFLICT', '同一标注修订不能存在不同记录。');
    revisionKeys.add(key);
  }
  for (const entry of changes.filter(item => item.collection === 'annotationExclusions' && item.value?.status === 'active')) {
    const exclusion = state.annotationExclusions.find(item => item.id === entry.id);
    const parent = state.contentAnnotations.find(item => item.id === exclusion.parentAnnotationId);
    const version = state.noteVersions.find(item => item.id === exclusion.noteVersionId);
    if (!version || !parent || parent.noteId !== version.noteId || parent.noteVersionId !== version.id
      || resolveAnchor(version.content, exclusion.anchor).status !== 'resolved'
      || exclusion.anchor.sourceStart < parent.anchor.sourceStart || exclusion.anchor.sourceEnd > parent.anchor.sourceEnd) throw syncError('ANNOTATION_EXCLUSION_CONFLICT', '排除范围与标题重点的来源不一致。', 422);
  }
  // 本次正文变化后，云端已有但本机未知的标注同样参与领域重定位。
  const annotations = createContentAnnotationService({
    repository: createInMemoryContentAnnotationRepository({ records: state.contentAnnotations }),
    noteRepository: createInMemoryNoteRepository({ records: state.notes }),
    noteVersionRepository: createInMemoryNoteVersionRepository({ records: state.noteVersions }),
    revisionRepository: createInMemoryAnnotationRevisionRepository({ records: state.annotationRevisions })
  });
  for (const change of changes.filter(item => item.collection === 'notes' && item.value)) {
    const note = state.notes.find(item => item.id === change.id);
    if (!state.noteVersions.some(version => version.noteId === note.id && version.contentHash === note.contentHash)) throw syncError('DEPENDENCY_MISSING', '正文对应的不可变版本尚未提交。');
    annotations.reconcileForNote(note.id, calculateContentHash(note.rawMarkdown));
  }
  for (const collection of ['folders', 'tags', 'tagGroups', 'notes']) {
    const names = new Set();
    for (const item of state[collection]) {
      if (item.deleted) continue;
      const parent = collection === 'folders' ? item.parentId : collection === 'notes' ? item.folderId : null;
      const key = JSON.stringify([item.spaceId, parent ?? null, ['tags', 'tagGroups'].includes(collection) ? (item.name ?? item.title).trim().toLocaleLowerCase() : (item.name ?? item.title).trim()]);
      if (names.has(key)) throw syncError('SIBLING_NAME_CONFLICT', '同一位置存在重名对象，请重命名后重试。');
      names.add(key);
    }
  }
  for (const folder of state.folders) if (state.notes.some(note => !note.deleted && note.spaceId === folder.spaceId && (note.folderId ?? null) === (folder.parentId ?? null) && note.title.trim() === folder.name.trim())) throw syncError('SIBLING_NAME_CONFLICT', '同一位置的目录和笔记不能重名。');
  for (const note of state.notes) for (const ref of referencesFor('notes', note)) {
    if (!state[ref.collection].some(item => item.id === ref.id)) throw syncError('DEPENDENCY_MISSING', '正文引用的目录、标签或附件尚未同步。');
  }
  for (const entry of changes.filter(item => item.collection === 'attachments' && !item.value)) {
    const reference = `/api/storage/attachments/${entry.id}/content`;
    if (state.noteVersions.some(version => version.content.includes(reference))) throw syncError('ATTACHMENT_REFERENCED', '历史版本仍引用此附件，不能删除。');
  }
  const folderMap = new Map(state.folders.map(folder => [folder.id, folder]));
  const paths = new Map();
  function folderPath(folder, visiting = new Set()) {
    if (paths.has(folder.id)) return paths.get(folder.id);
    if (visiting.has(folder.id)) throw syncError('FOLDER_PARENT_CONFLICT', '目录不能循环嵌套。', 422);
    visiting.add(folder.id);
    const parent = folder.parentId ? folderMap.get(folder.parentId) : null;
    if (folder.parentId && !parent) throw syncError('DEPENDENCY_MISSING', '父目录不存在。');
    const segment = folder.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'folder';
    const result = `${parent ? folderPath(parent, visiting) : ''}/${segment}`;
    visiting.delete(folder.id); paths.set(folder.id, result); return result;
  }
  for (const folder of state.folders) folder.pathCache = folderPath(folder);
  // 校验器同时推导证据、知识点和试题来源状态，客户端不能自行提交这些状态。
  state = validatePersistedLocalState(createPersistedLocalDocument(reconcileSyncedSourceStates(state)));
  return { state, aliases };
}
