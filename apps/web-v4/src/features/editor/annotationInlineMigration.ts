import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Transform } from '@milkdown/kit/prose/transform';
import { projectMarkdown, type ContentAnchor } from '@study-accelerator/content-anchor';
import { knowraCheck, parseKnowraMarks, stripKnowraMarks } from '@study-accelerator/shared/knowra-marks';
import type { Annotation } from '@study-accelerator/web-core';
import { resolveAnnotationRange } from './editorAnnotations';
import { listItemAt } from './editorListAnnotations';
import { outerBlocks } from './editorInlineAnnotations';
import { KNOWRA_BLOCKS_ATTR, KNOWRA_MARK, type KnowraBlockEntry, type KnowraMarkProblem } from './editorKnowraMarks';

/**
 * 重点内联化 I3（《重点标记内联化方案》第 5 节）：把一篇笔记的旧重点（v2 锚点）换算成正文标记。
 * 纯计算，不读写任何存储：用编辑器打开正文，按旧链路当前显示的位置（resolveAnnotationRange）打上
 * knowraMark / knowraBlocks，再序列化并自检。试运行与正式迁移共用同一份计算。
 */
export interface MigrationCodec {
  /** 编辑器解析器（已接入 Knowra 标记转换）。 */
  parse(markdown: string): ProseNode;
  /** 编辑器序列化器（已接入 Knowra 标记转换）。 */
  serialize(doc: ProseNode): string;
  /** 取出并清空上一次 parse / serialize 期间的标记问题。 */
  takeProblems(): KnowraMarkProblem[];
}

export interface MigrationExclusion { id: string; parentAnnotationId: string; status?: string; anchor: ContentAnchor & { unresolved?: boolean } }

export type AnnotationOutcomeStatus = 'migrated' | 'skipped' | 'unplaced';
export interface AnnotationOutcome {
  annotationId: string;
  markId: string | null;
  status: AnnotationOutcomeStatus;
  /** 跳过或未落位的原因（中文，直接展示给用户）。 */
  reason: string | null;
  scopeType: string;
  kind: string;
  importance: string | null;
  quoteText: string;
  /** 迁移后标记实际覆盖的文字；块级重点为所在块的文字。 */
  placedText: string | null;
  /** 定位方式：editor 为旧链路当前显示的位置；headingTitle 为章节按"同级同名标题的第几个"兜底匹配；existing 为正文里已有对应标记（续跑）。 */
  method?: 'editor' | 'headingTitle' | 'existing';
}

export interface NoteMigrationPlan {
  /** 迁移后的正文（只改标记；若编辑器会改写格式，也包含格式改写）。 */
  markdown: string;
  /** 编辑器打开再保存，即使不打重点也会改写这篇笔记的格式。 */
  rewritesFormat: boolean;
  outcomes: AnnotationOutcome[];
  excludedBlocks: number;
  /** 自检发现的问题；非空时这篇笔记不能自动迁移。 */
  issues: string[];
}


/** 笔记内唯一、由旧重点 ID 确定的短标记 ID：试运行与正式迁移得到同一个结果。 */
export const migrationBaseMarkId = (annotationId: string) => `a${knowraCheck(annotationId)}`;

export function migrationMarkId(annotationId: string, taken: Set<string>) {
  const base = migrationBaseMarkId(annotationId);
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}${suffix}`;
  taken.add(id);
  return id;
}

function markData(annotation: Annotation) {
  const data: Record<string, string> = { t: 'key' };
  if (annotation.kind && annotation.kind !== 'important') data.c = annotation.kind;
  if (annotation.importance === 'important' || annotation.importance === 'core') data.l = annotation.importance;
  return data;
}

/**
 * 章节兜底：编辑器的章节定位要求整篇标题与投影完全一致，个别笔记（如含非 ATX 标题）会失败。
 * 服务端已确认锚点在当前正文中可定位，这里按"同级同名标题里的第几个"在编辑器中找回；
 * 两边同级同名标题数量不一致时放弃，不猜。
 */
function resolveSectionByTitle(doc: ProseNode, annotation: Annotation, storedMarkdown: string) {
  const section = annotation.anchor?.section;
  if (!section || annotation.scopeType !== 'section') return null;
  const same = projectMarkdown(storedMarkdown).headings.filter(heading => heading.title === section.title && heading.level === section.headingLevel);
  const start = section.sourceStart ?? annotation.anchor!.sourceStart;
  const ordinal = same.findIndex(heading => heading.sourceStart === start);
  if (ordinal < 0) return null;
  const candidates: number[] = [];
  doc.descendants((node, position) => {
    if (node.type.name === 'heading' && Number(node.attrs.level) === section.headingLevel && node.textContent.trim() === section.title) candidates.push(position);
  });
  return candidates.length === same.length ? candidates[ordinal] : null;
}

function blockText(node: ProseNode) {
  return node.textBetween(0, node.content.size, '\n', '￼').split('\n')[0] ?? '';
}

function coverage(doc: ProseNode) {
  const inline = new Map<string, string>();
  const blocks = new Set<string>();
  doc.descendants((node) => {
    // 按块类型与文字比较，不按位置：编辑器规范化前后同一块的位置可能不同。
    for (const item of (node.attrs[KNOWRA_BLOCKS_ATTR] as KnowraBlockEntry[] | null) ?? []) blocks.add(`${item.id}:${item.exclude ? 'x' : item.attrs.s}:${node.type.name}:${blockText(node)}`);
    if (!node.isText) return;
    for (const mark of node.marks) if (mark.type.name === KNOWRA_MARK) inline.set(mark.attrs.id, (inline.get(mark.attrs.id) ?? '') + node.text);
  });
  return { inline, blocks };
}

export function planNoteMigration(input: { markdown: string; annotations: Annotation[]; exclusions?: MigrationExclusion[] }, codec: MigrationCodec): NoteMigrationPlan {
  const issues: string[] = [];
  codec.takeProblems();
  const doc = codec.parse(input.markdown);
  const canonical = codec.serialize(doc);
  const parseProblems = codec.takeProblems();
  if (parseProblems.length) issues.push(`打开时已有无法识别的标记：${parseProblems.map(item => item.reason).join('、')}`);
  const projection = projectMarkdown(canonical);
  const existingIds = new Set([...parseKnowraMarks(canonical).inline.map(item => item.id), ...parseKnowraMarks(canonical).blocks.map(item => item.id)]);
  /** 迁移前正文里已有的标记：上次迁移写出后中断，再跑时视为已迁移，不重复打标记。 */
  const preexisting = new Set(existingIds);
  const tr = new Transform(doc);
  const markType = doc.type.schema.marks[KNOWRA_MARK];
  const outcomes: AnnotationOutcome[] = [];
  const migratedMarkIds = new Map<string, string>();
  const appendBlock = (position: number, entry: KnowraBlockEntry) => {
    const current = (tr.doc.nodeAt(position)?.attrs[KNOWRA_BLOCKS_ATTR] as KnowraBlockEntry[] | null) ?? [];
    if (current.some(item => item.id === entry.id && Boolean(item.exclude) === Boolean(entry.exclude))) return;
    tr.setNodeAttribute(position, KNOWRA_BLOCKS_ATTR, [...current, entry]);
  };

  for (const annotation of input.annotations) {
    const base = {
      annotationId: annotation.id, markId: null, scopeType: annotation.scopeType ?? 'selection', kind: annotation.kind,
      importance: annotation.importance ?? null, quoteText: annotation.quoteText, placedText: null
    };
    const skip = (status: AnnotationOutcomeStatus, reason: string) => outcomes.push({ ...base, status, reason });
    if ((annotation.lifecycleStatus ?? 'active') !== 'active') { skip('skipped', annotation.lifecycleStatus === 'archived' ? '已归档，不迁移' : '已取消，不迁移'); continue; }
    if (preexisting.has(migrationBaseMarkId(annotation.id))) {
      const markId = migrationBaseMarkId(annotation.id);
      outcomes.push({ ...base, status: 'migrated', reason: null, method: 'existing', markId, placedText: null });
      migratedMarkIds.set(annotation.id, markId);
      continue;
    }
    if (annotation.schemaVersion !== 2 || !annotation.anchor) { skip('unplaced', '旧版重点，没有可靠位置，需要重新选择'); continue; }
    if (annotation.anchorStatus === 'missing') { skip('unplaced', '原文位置已丢失，需要重新选择'); continue; }
    if (annotation.anchorStatus && annotation.anchorStatus !== 'resolved') { skip('unplaced', '范围待确认，需要先确认或重新选择'); continue; }
    let range = resolveAnnotationRange(doc, annotation, projection);
    let method: AnnotationOutcome['method'] = 'editor';
    if (!range) {
      const heading = resolveSectionByTitle(doc, annotation, input.markdown);
      if (heading !== null && heading !== undefined) { range = { from: heading + 1, to: heading + 1 }; method = 'headingTitle'; }
    }
    if (!range) { skip('unplaced', '编辑器里无法定位到原文'); continue; }
    const markId = migrationMarkId(annotation.id, existingIds);
    const data = markData(annotation);
    const scope = annotation.scopeType ?? 'selection';
    if (scope === 'selection') {
      if (range.to <= range.from || !doc.textBetween(range.from, range.to).trim()) { skip('unplaced', '选区里没有可标记的文字'); continue; }
      tr.addMark(range.from, range.to, markType.create({ id: markId, data }));
      outcomes.push({ ...base, status: 'migrated', reason: null, method, markId, placedText: doc.textBetween(range.from, range.to, '\n', '￼') });
    } else if (scope === 'section') {
      const heading = doc.nodeAt(range.from - 1);
      if (heading?.type.name !== 'heading') { skip('unplaced', '找不到章节标题'); continue; }
      appendBlock(range.from - 1, { id: markId, attrs: { s: 'section', ...data } });
      outcomes.push({ ...base, status: 'migrated', reason: null, method, markId, placedText: blockText(heading) });
    } else if (scope === 'list') {
      const item = listItemAt(doc, range.from);
      if (!item) { skip('unplaced', '找不到列表项'); continue; }
      appendBlock(item.position, { id: markId, attrs: { s: 'list', ...data } });
      outcomes.push({ ...base, status: 'migrated', reason: null, method, markId, placedText: blockText(item.node) });
    } else {
      const blocks = outerBlocks(doc, range.from, range.to);
      if (!blocks.length) { skip('unplaced', '范围内没有可标记的块'); continue; }
      for (const block of blocks) appendBlock(block.position, { id: markId, attrs: { s: 'blocks', ...data } });
      outcomes.push({ ...base, status: 'migrated', reason: null, method, markId, placedText: blocks.map(block => blockText(block.node)).join(' / ') });
    }
    migratedMarkIds.set(annotation.id, markId);
  }

  let excludedBlocks = 0;
  for (const exclusion of input.exclusions ?? []) {
    const markId = migratedMarkIds.get(exclusion.parentAnnotationId);
    if (!markId || (exclusion.status && exclusion.status !== 'active') || exclusion.anchor.unresolved) continue;
    const range = resolveAnnotationRange(doc, { scopeType: exclusion.anchor.scopeType, anchor: exclusion.anchor, quoteText: exclusion.anchor.quoteText } as Annotation, projection);
    if (!range) { issues.push(`排除区间 ${exclusion.id} 无法定位，迁移后不再排除`); continue; }
    for (const block of outerBlocks(doc, range.from, range.to)) { appendBlock(block.position, { id: markId, attrs: {}, exclude: true }); excludedBlocks += 1; }
  }

  const migrated = tr.doc;
  const markdown = codec.serialize(migrated);
  for (const problem of codec.takeProblems()) issues.push(`写出标记失败（${problem.id ?? '未知'}）：${problem.reason}`);
  if (stripKnowraMarks(markdown) !== stripKnowraMarks(canonical)) issues.push('去掉标记后正文与编辑器规范正文不一致');
  const syntax = parseKnowraMarks(markdown).problems;
  if (syntax.length) issues.push(`写出的标记有语法问题：${syntax.map(item => item.reason).join('、')}`);
  const reopened = codec.parse(markdown);
  for (const problem of codec.takeProblems()) issues.push(`重开时无法落位（${problem.id ?? '未知'}）：${problem.reason}`);
  const intended = coverage(migrated);
  const actual = coverage(reopened);
  for (const [id, text] of intended.inline) if (actual.inline.get(id) !== text) issues.push(`重点 ${id} 重开后覆盖文字变化：「${text.slice(0, 40)}」→「${(actual.inline.get(id) ?? '').slice(0, 40)}」`);
  for (const key of intended.blocks) if (!actual.blocks.has(key)) issues.push(`块级标记 ${key.split(':')[0]} 重开后不在原来的块上`);
  if (codec.serialize(reopened) !== markdown) issues.push('重开后再次保存的正文不一致');
  codec.takeProblems();
  return { markdown, rewritesFormat: canonical !== input.markdown, outcomes, excludedBlocks, issues };
}
