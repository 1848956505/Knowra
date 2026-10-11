import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import { calculateContentHash } from './index.js';

/**
 * 稳定身份迁移（S2a 影子阶段）：编辑器块序列与 Markdown 块对齐，并把编辑器身份视角下的重点位置
 * 与旧链路的跟随结果放到同一组块上比较。只产出诊断记录，不改变任何持久化结果。
 */
export const IDENTITY_SHADOW_FORMAT = 2;

/** 编辑器节点名 → Markdown 块类型。表格单元格内部不参与对齐。 */
export const EDITOR_TO_MARKDOWN_BLOCK = Object.freeze({
  paragraph: 'paragraph', heading: 'heading', blockquote: 'blockquote', code_block: 'code', hr: 'thematicBreak',
  list_item: 'listItem', table: 'table', math_block: 'math', html: 'html'
});
const MARKDOWN_BLOCKS = new Set(Object.values(EDITOR_TO_MARKDOWN_BLOCK));
const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'code', 'math', 'html', 'thematicBreak', 'table']);
const LIMITS = { blocks: 50000, annotations: 5000, id: 128, quote: 20000 };
const BR_HTML = /^\s*<br\s*\/?>\s*$/i;

/** 与编辑器相同的块解析：gfm + 公式（单美元行内公式）。 */
export function parseIdentityBlocks(markdown) {
  const source = String(markdown ?? '');
  const tree = fromMarkdown(source, {
    extensions: [gfm(), math({ singleDollarTextMath: true })],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()]
  });
  const blocks = [];
  const walk = (node, depth) => {
    if (MARKDOWN_BLOCKS.has(node.type) && node.position) {
      blocks.push({
        type: node.type, depth,
        sourceStart: node.position.start.offset, sourceEnd: node.position.end.offset,
        br: node.type === 'html' && BR_HTML.test(node.value ?? '')
      });
    }
    if (node.type === 'table') return;
    for (const child of node.children ?? []) walk(child, MARKDOWN_BLOCKS.has(node.type) ? depth + 1 : depth);
  };
  walk(tree, 0);
  return blocks;
}

/**
 * 按类型顺序对齐。已知差异：Markdown `<br />` HTML 块对应编辑器空段落；无对应的编辑器空段落跳过。
 * 返回 editorIndex → markdownIndex；无法对齐时返回失败位置。
 */
export function alignIdentityBlocks(markdownBlocks, editorBlocks) {
  const pairs = new Map();
  let i = 0, j = 0;
  while (i < editorBlocks.length || j < markdownBlocks.length) {
    const editor = editorBlocks[i], markdown = markdownBlocks[j];
    if (editor && markdown && editor.type === markdown.type) { pairs.set(i++, j++); continue; }
    if (editor?.type === 'paragraph' && editor.empty && markdown?.br) { pairs.set(i++, j++); continue; }
    if (editor?.type === 'paragraph' && editor.empty) { i++; continue; }
    return { aligned: false, editorIndex: i, markdownIndex: j, editorType: editor?.type ?? null, markdownType: markdown?.type ?? null };
  }
  return { aligned: true, pairs };
}

function text(value, max) { return typeof value === 'string' && value.length <= max; }
function optionalId(value) { return value === undefined || text(value, LIMITS.id); }

/** 编辑器状态来自客户端，形状不合法时整体忽略，不能影响保存。 */
export function validIdentityEditorState(state) {
  if (!state || typeof state !== 'object' || state.formatVersion !== IDENTITY_SHADOW_FORMAT) return false;
  if (!text(state.targetContentHash, 128) || !Array.isArray(state.blocks) || !Array.isArray(state.annotations)) return false;
  if (state.blocks.length > LIMITS.blocks || state.annotations.length > LIMITS.annotations) return false;
  const blocksOk = state.blocks.every(block => block && text(block.id, LIMITS.id) && MARKDOWN_BLOCKS.has(block.type) && typeof block.empty === 'boolean');
  return blocksOk && state.annotations.every(item => item && text(item.id, LIMITS.id) && typeof item.present === 'boolean'
    && ['selection', 'blocks', 'section', 'list'].includes(item.scopeType)
    && optionalId(item.rootBlockId) && optionalId(item.startBlockId) && optionalId(item.endBlockId)
    && (item.quoteText === undefined || text(item.quoteText, LIMITS.quote)));
}

function deepestContaining(blocks, offset, types) {
  let found = -1;
  blocks.forEach((block, index) => {
    if (types.has(block.type) && block.sourceStart <= offset && offset < block.sourceEnd
      && (found < 0 || block.depth >= blocks[found].depth)) found = index;
  });
  return found;
}

/** 旧链路结果（源码偏移）换算到编辑器块 ID。 */
function oldTargets(annotation, blocks, idByMarkdownIndex) {
  const anchor = annotation.anchor ?? {};
  const start = Number.isInteger(anchor.sourceStart) ? anchor.sourceStart : annotation.fromPosition;
  const end = Number.isInteger(anchor.sourceEnd) ? anchor.sourceEnd : annotation.toPosition;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  const id = index => (index < 0 ? null : idByMarkdownIndex.get(index) ?? null);
  if (annotation.scopeType === 'section') return { rootBlockId: id(deepestContaining(blocks, start, new Set(['heading']))) };
  if (annotation.scopeType === 'list') return { rootBlockId: id(deepestContaining(blocks, start, new Set(['listItem']))) };
  return {
    startBlockId: id(deepestContaining(blocks, start, TEXT_BLOCKS)),
    endBlockId: id(deepestContaining(blocks, Math.max(start, end - 1), TEXT_BLOCKS))
  };
}

const normalizeQuote = value => String(value ?? '').replace(/[\s￼]+/g, '');

/**
 * 比较一次保存后的两边结论。`annotations` 是旧链路完成跟随后的仓库记录。
 * 返回汇总与逐条分歧；记录只含 ID、范围类型和结论，不含正文。
 */
export function compareIdentityShadow({ markdown, editorState, annotations }) {
  if (!validIdentityEditorState(editorState)) return { status: 'invalidState', compared: 0, divergences: [] };
  if (editorState.targetContentHash !== calculateContentHash(markdown)) return { status: 'stateMismatch', compared: 0, divergences: [] };
  const blocks = parseIdentityBlocks(markdown);
  const alignment = alignIdentityBlocks(blocks, editorState.blocks);
  if (!alignment.aligned) {
    const { editorIndex, markdownIndex, editorType, markdownType } = alignment;
    return { status: 'alignFailed', compared: 0, divergences: [], alignment: { editorIndex, markdownIndex, editorType, markdownType } };
  }
  const idByMarkdownIndex = new Map([...alignment.pairs].map(([editorIndex, markdownIndex]) => [markdownIndex, editorState.blocks[editorIndex].id]));
  const byId = new Map(annotations.filter(item => (item.lifecycleStatus ?? 'active') === 'active').map(item => [item.id, item]));
  const divergences = [];
  let compared = 0;
  for (const identity of editorState.annotations) {
    const old = byId.get(identity.id);
    if (!old || old.scopeType !== identity.scopeType) continue;
    compared += 1;
    const base = { annotationId: identity.id, scopeType: identity.scopeType, oldStatus: old.anchorStatus ?? null, oldReason: old.anchorReason ?? null };
    if (old.anchorStatus !== 'resolved') {
      if (identity.present) divergences.push({ ...base, kind: old.anchorStatus === 'missing' ? 'trackedLost' : 'oldNeedsReview' });
      continue;
    }
    if (!identity.present) { divergences.push({ ...base, kind: 'identityLost' }); continue; }
    const targets = oldTargets(old, blocks, idByMarkdownIndex);
    const keys = identity.scopeType === 'section' || identity.scopeType === 'list' ? ['rootBlockId'] : ['startBlockId', 'endBlockId'];
    if (!targets || keys.some(key => targets[key] !== identity[key])) { divergences.push({ ...base, kind: 'blockMismatch' }); continue; }
    if (identity.scopeType === 'selection' && normalizeQuote(identity.quoteText) !== normalizeQuote(old.quoteText ?? old.anchor?.quoteText)) {
      divergences.push({ ...base, kind: 'quoteMismatch' });
    }
  }
  return { status: 'compared', compared, divergences };
}
