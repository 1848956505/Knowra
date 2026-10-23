import type { ContentAnnotation } from '../domain/content-annotation.ts';

/** 历史值未经本仓库校验；可选字段保留 unknown，不冒充领域构造结果。 */
export type ContentAnnotationRecord = { [Field in keyof ContentAnnotation]?: unknown };
export type NormalizedContentAnnotationRecord = ContentAnnotationRecord & {
  schemaVersion: unknown;
  scopeType: unknown;
  revision: unknown;
  lifecycleStatus: unknown;
  anchorStatus: unknown;
};
export interface ContentAnnotationRepository {
  save<Value extends ContentAnnotationRecord>(annotation: Value): ContentAnnotationRecord;
  findById(id: unknown): NormalizedContentAnnotationRecord | null;
  findByIdempotencyKey(noteId: unknown, idempotencyKey: unknown): NormalizedContentAnnotationRecord | null;
  findDuplicate(options: ContentAnnotationDuplicateOptions): NormalizedContentAnnotationRecord | null;
  list(options?: ContentAnnotationListOptions): NormalizedContentAnnotationRecord[];
  deleteByNoteIds(noteIds: Iterable<unknown> | null | undefined): ContentAnnotationRecord[];
  markStaleByNoteId(noteId: unknown, currentContentHash: unknown): ContentAnnotationRecord[];
}
export interface ContentAnnotationRepositoryOptions {
  records?: ContentAnnotationRecord[] | null;
  /** 每次持久化读取当前回调并保留 options 接收者；错误不回滚此前数组/字段修改。 */
  onChange?: ((records: ContentAnnotationRecord[]) => unknown) | null;
}
export interface ContentAnnotationListOptions {
  noteId?: unknown;
  spaceId?: unknown;
  includeDeleted?: unknown;
  kind?: unknown;
  scopeType?: unknown;
  anchorStatus?: unknown;
}
export interface ContentAnnotationDuplicateOptions {
  noteId?: unknown;
  kind?: unknown;
  scopeType?: unknown;
  anchorFingerprint?: unknown;
  quoteText?: unknown;
  fromPosition?: unknown;
  toPosition?: unknown;
}
export function createInMemoryContentAnnotationRepository(
  options: ContentAnnotationRepositoryOptions = {}
): ContentAnnotationRepository {
  const records = options.records ?? [];
  const persist = () => options.onChange?.(records);
  // map 的记录元素契约为非空对象，原真值分支必返回新对象；仅缩小此处回调的输入域，不验证或改变字段。
  const normalized = (item: ContentAnnotationRecord | undefined) =>
    item
      ? {
          ...item,
          schemaVersion: item.schemaVersion ?? 1,
          scopeType: item.scopeType ?? 'selection',
          revision: item.revision ?? 1,
          lifecycleStatus: item.lifecycleStatus ?? (item.status === 'archived' ? 'archived' : 'active'),
          anchorStatus: item.anchorStatus ?? (item.status === 'stale' ? 'needsReview' : 'resolved')
        }
      : null;
  const active = (item: ContentAnnotationRecord, includeDeleted: unknown) =>
    includeDeleted || (item.lifecycleStatus ?? item.status) === 'active';
  return {
    save<Value extends ContentAnnotationRecord>(annotation: Value): ContentAnnotationRecord {
      const index = records.findIndex(item => item.id === annotation.id);
      if (index < 0) records.push(annotation);
      else records[index] = annotation;
      persist();
      return annotation;
    },
    findById(id: unknown) {
      return normalized(records.find(item => item.id === id));
    },
    findByIdempotencyKey(noteId: unknown, idempotencyKey: unknown) {
      return normalized(records.find(item => item.noteId === noteId && item.idempotencyKey === idempotencyKey));
    },
    findDuplicate({
      noteId,
      kind,
      scopeType,
      anchorFingerprint,
      quoteText,
      fromPosition,
      toPosition
    }: ContentAnnotationDuplicateOptions) {
      return (
        records
          .map(normalized as (item: ContentAnnotationRecord) => NormalizedContentAnnotationRecord)
          .find(
            item =>
              item.noteId === noteId &&
              item.lifecycleStatus === 'active' &&
              item.kind === kind &&
              (anchorFingerprint
                ? item.anchorFingerprint === anchorFingerprint && item.scopeType === scopeType
                : item.quoteText === quoteText && item.fromPosition === fromPosition && item.toPosition === toPosition)
          ) ?? null
      );
    },
    list({
      noteId,
      spaceId,
      includeDeleted = false,
      kind,
      scopeType,
      anchorStatus
    }: ContentAnnotationListOptions = {}) {
      return records
        .map(normalized as (item: ContentAnnotationRecord) => NormalizedContentAnnotationRecord)
        .filter(
          item =>
            (!noteId || item.noteId === noteId) &&
            (!spaceId || item.spaceId === spaceId) &&
            (!kind || item.kind === kind) &&
            (!scopeType || item.scopeType === scopeType) &&
            (!anchorStatus || item.anchorStatus === anchorStatus) &&
            active(item, includeDeleted)
        );
    },
    deleteByNoteIds(noteIds: Iterable<unknown> | null | undefined) {
      const noteIdSet = new Set(noteIds);
      const deleted: ContentAnnotationRecord[] = [];

      for (let index = records.length - 1; index >= 0; index -= 1) {
        if (!noteIdSet.has(records[index].noteId)) {
          continue;
        }
        deleted.push(...records.splice(index, 1));
      }

      if (deleted.length > 0) {
        persist();
      }
      return deleted.reverse();
    },
    markStaleByNoteId(noteId: unknown, currentContentHash: unknown) {
      const changed: ContentAnnotationRecord[] = [];
      for (const item of records) {
        // v3（内联重点）的位置在正文标记里，不按正文哈希判定过期。
        if (
          item.noteId !== noteId ||
          !active(item, false) ||
          item.noteContentHash === currentContentHash ||
          item.schemaVersion === 3
        )
          continue;
        item.anchorStatus = 'needsReview';
        item.anchorReason = 'contentChanged';
        item.status = 'stale';
        item.revision = Number(item.revision ?? 1) + 1;
        item.updatedAt = new Date().toISOString();
        changed.push(item);
      }
      if (changed.length > 0) persist();
      return changed;
    }
  };
}
