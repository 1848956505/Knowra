import type { Annotation, AnnotationPreview, Note, UpdateAnnotationInput, UpdateNoteInput } from '@study-accelerator/web-core';
import { planNoteMigration, type MigrationCodec, type MigrationExclusion, type NoteMigrationPlan } from './annotationInlineMigration';
import { inlineMarkIdOf, isInlineAnnotation } from './editorInlineAnnotations';

/**
 * 重点内联化 I3c：设置里的一次性"迁移重点到正文"。
 * 检查（只读）→ 执行：逐篇保存写好标记的正文 → 确认服务端已派生 v3 行 → 转移备注 → 取消旧重点（7 天后自动回收）。
 * 每篇单独处理：自检不过、正文在检查后被改过、保存冲突或派生缺失时，这篇保持原样并在报告中说明。
 */
export interface MigrationApi {
  getNote(noteId: string): Promise<Note>;
  updateNote(noteId: string, input: UpdateNoteInput): Promise<Note>;
  listAnnotations(noteId: string, spaceId: string): Promise<Annotation[]>;
  deleteAnnotation(annotationId: string, expectedRevision?: number): Promise<Annotation>;
  updateAnnotation?(annotationId: string, input: UpdateAnnotationInput): Promise<Annotation>;
  previewAnnotation?(annotationId: string): Promise<AnnotationPreview>;
}

export interface MigrationNoteRef { id: string; title: string; spaceId: string; deleted?: boolean }

export interface NoteMigrationCheck {
  note: MigrationNoteRef;
  updatedAt: string;
  rawMarkdown: string;
  legacy: Annotation[];
  exclusions: MigrationExclusion[];
  plan: NoteMigrationPlan;
}

export type NoteMigrationStatus = 'migrated' | 'skipped' | 'failed';
export interface NoteMigrationResult {
  note: MigrationNoteRef;
  status: NoteMigrationStatus;
  /** 跳过或失败的原因（中文）。 */
  message: string | null;
  migrated: number;
  abandoned: number;
  commentsCarried: number;
  rewritesFormat: boolean;
}

export interface MigrationProgress { phase: 'check' | 'migrate'; done: number; total: number; title?: string }

const isLegacyActive = (annotation: Annotation) => !isInlineAnnotation(annotation) && (annotation.lifecycleStatus ?? 'active') === 'active';

async function exclusionsOf(api: MigrationApi, legacy: Annotation[]): Promise<MigrationExclusion[]> {
  if (!api.previewAnnotation) return [];
  const result: MigrationExclusion[] = [];
  for (const annotation of legacy.filter(item => ['section', 'list'].includes(item.scopeType ?? ''))) {
    const preview = await api.previewAnnotation(annotation.id);
    for (const exclusion of preview.exclusions ?? []) result.push({ id: exclusion.id, parentAnnotationId: annotation.id, status: exclusion.status, anchor: exclusion.anchor as unknown as MigrationExclusion['anchor'] });
  }
  return result;
}

/** 检查（只读）：找出还有活跃旧重点的笔记，逐篇算出迁移结果。回收站里的笔记暂不迁移。 */
export async function checkInlineMigration(notes: MigrationNoteRef[], api: MigrationApi, codec: MigrationCodec, onProgress?: (progress: MigrationProgress) => void) {
  const checks: NoteMigrationCheck[] = [];
  const candidates = notes.filter(note => !note.deleted);
  for (const [index, note] of candidates.entries()) {
    onProgress?.({ phase: 'check', done: index, total: candidates.length, title: note.title });
    const legacy = (await api.listAnnotations(note.id, note.spaceId)).filter(isLegacyActive);
    if (!legacy.length) continue;
    const full = await api.getNote(note.id);
    const exclusions = await exclusionsOf(api, legacy);
    const plan = planNoteMigration({ markdown: full.rawMarkdown, annotations: legacy, exclusions }, codec);
    checks.push({ note, updatedAt: full.updatedAt ?? '', rawMarkdown: full.rawMarkdown, legacy, exclusions, plan });
  }
  onProgress?.({ phase: 'check', done: candidates.length, total: candidates.length });
  return checks;
}

export function summarizeChecks(checks: NoteMigrationCheck[]) {
  const outcomes = checks.flatMap(check => check.plan.outcomes);
  return {
    notes: checks.length,
    migratable: outcomes.filter(item => item.status === 'migrated').length,
    abandoned: outcomes.filter(item => item.status === 'unplaced').length,
    blockedNotes: checks.filter(check => check.plan.issues.length).length,
    rewritesFormat: checks.filter(check => check.plan.rewritesFormat).length
  };
}

async function migrateOne(check: NoteMigrationCheck, api: MigrationApi, codec: MigrationCodec): Promise<NoteMigrationResult> {
  const result: NoteMigrationResult = { note: check.note, status: 'migrated', message: null, migrated: 0, abandoned: 0, commentsCarried: 0, rewritesFormat: check.plan.rewritesFormat };
  const fail = (status: NoteMigrationStatus, message: string) => ({ ...result, status, message });
  // 检查之后正文可能又被改过：按最新正文重新计算。
  const current = await api.getNote(check.note.id);
  let plan = check.plan;
  if (current.updatedAt !== check.updatedAt || current.rawMarkdown !== check.rawMarkdown) {
    const legacy = (await api.listAnnotations(check.note.id, check.note.spaceId)).filter(isLegacyActive);
    plan = planNoteMigration({ markdown: current.rawMarkdown, annotations: legacy, exclusions: await exclusionsOf(api, legacy) }, codec);
  }
  if (plan.issues.length) return fail('skipped', `自检未通过，保持原样：${plan.issues[0]}`);
  if (plan.markdown !== current.rawMarkdown) {
    try { await api.updateNote(check.note.id, { rawMarkdown: plan.markdown, expectedUpdatedAt: current.updatedAt }); }
    catch (error) { return fail('failed', `保存正文失败，保持原样：${error instanceof Error ? error.message : String(error)}`); }
  }
  const after = await api.listAnnotations(check.note.id, check.note.spaceId);
  const byMarkId = new Map(after.filter(isInlineAnnotation).map(item => [inlineMarkIdOf(item), item]));
  const migrated = plan.outcomes.filter(item => item.status === 'migrated');
  const missing = migrated.filter(item => !byMarkId.has(item.markId));
  // 正文已写好但没有派生出重点行：不取消旧重点，保证这篇的重点不会丢；下次迁移会按已有标记续跑。
  if (missing.length) return fail('failed', `正文已写入标记，但有 ${missing.length} 条重点没有派生出来，旧重点保留`);
  const latest = new Map(after.map(item => [item.id, item]));
  for (const outcome of migrated) {
    const old = check.legacy.find(item => item.id === outcome.annotationId) ?? latest.get(outcome.annotationId);
    const target = byMarkId.get(outcome.markId)!;
    if (old?.comment && !target.comment && api.updateAnnotation) {
      await api.updateAnnotation(target.id, { expectedRevision: target.revision ?? 1, comment: old.comment });
      result.commentsCarried += 1;
    }
  }
  // 已迁移的和放弃的旧重点都取消；取消后 7 天由回收策略清理，被证据引用的保留。
  for (const old of after.filter(isLegacyActive)) {
    await api.deleteAnnotation(old.id, old.revision);
  }
  result.migrated = migrated.length;
  result.abandoned = plan.outcomes.filter(item => item.status === 'unplaced').length;
  return result;
}

/** 执行：逐篇迁移，单篇失败不影响其他笔记。调用方负责事先备份与同步检查。 */
export async function executeInlineMigration(checks: NoteMigrationCheck[], api: MigrationApi, codec: MigrationCodec, onProgress?: (progress: MigrationProgress) => void) {
  const results: NoteMigrationResult[] = [];
  for (const [index, check] of checks.entries()) {
    onProgress?.({ phase: 'migrate', done: index, total: checks.length, title: check.note.title });
    try { results.push(await migrateOne(check, api, codec)); }
    catch (error) {
      results.push({ note: check.note, status: 'failed', message: error instanceof Error ? error.message : String(error), migrated: 0, abandoned: 0, commentsCarried: 0, rewritesFormat: check.plan.rewritesFormat });
    }
  }
  onProgress?.({ phase: 'migrate', done: checks.length, total: checks.length });
  return results;
}
