import { calculateContentHash } from './hash.js';
import { parseIdentityBlocks, validIdentityTable } from './identity-shadow.js';
import { blockOffsetToSource, identityBlockModels, sourceToBlockOffset, tableCellAt } from './block-offsets.js';

/**
 * 重点绑定（稳定身份迁移 S2b-2）：用块身份表中的 ID 描述重点位置。
 * - 选区：起止各为 { blockId, offset, cell? }，offset 为编辑器内容偏移，表格内附带 [行, 列]。
 * - 块：起止块 ID；章节、列表：根块 ID。
 * `contentHash` 记录计算绑定时的正文；与当前正文不同说明块内偏移可能已过期，块 ID 仍可参考。
 */
export const IDENTITY_BINDING_FORMAT = 2;
const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'code', 'html', 'table']);

function deepestIndex(blocks, offset, types) {
  let found = -1;
  blocks.forEach((block, index) => {
    if (types.has(block.type) && block.sourceStart <= offset && offset < block.sourceEnd && (found < 0 || block.depth >= blocks[found].depth)) found = index;
  });
  return found;
}

function context(markdown, identity) {
  if (!validIdentityTable(markdown, identity)) return null;
  return { blocks: parseIdentityBlocks(markdown), models: identityBlockModels(markdown), ids: identity.blocks.map(block => block.id), contentHash: identity.contentHash };
}

function pointFromSource(ctx, sourceOffset, edge) {
  const probe = edge === 'end' ? Math.max(0, sourceOffset - 1) : sourceOffset;
  const index = deepestIndex(ctx.blocks, probe, TEXT_BLOCKS);
  if (index < 0) return null;
  const model = ctx.models[index];
  const cell = model?.kind === 'table' ? tableCellAt(model, probe) : undefined;
  if (model?.kind === 'table' && !cell) return null;
  const offset = sourceToBlockOffset(model, sourceOffset, edge, cell);
  if (offset === null) return null;
  return { blockId: ctx.ids[index], offset, ...(cell ? { cell } : {}) };
}

/** 由旧链路已定位的锚点推出绑定；无法精确换算时返回 null。 */
export function bindingFromAnchor(markdown, identity, annotation) {
  const ctx = context(markdown, identity);
  const anchor = annotation?.anchor;
  if (!ctx || annotation?.anchorStatus !== 'resolved' || !anchor) return null;
  const start = Number.isInteger(anchor.sourceStart) ? anchor.sourceStart : annotation.fromPosition;
  const end = Number.isInteger(anchor.sourceEnd) ? anchor.sourceEnd : annotation.toPosition;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
  const base = { formatVersion: IDENTITY_BINDING_FORMAT, contentHash: ctx.contentHash, scopeType: annotation.scopeType };
  if (annotation.scopeType === 'section' || annotation.scopeType === 'list') {
    const index = deepestIndex(ctx.blocks, start, new Set([annotation.scopeType === 'section' ? 'heading' : 'listItem']));
    return index < 0 ? null : { ...base, rootBlockId: ctx.ids[index] };
  }
  if (annotation.scopeType === 'blocks') {
    const first = deepestIndex(ctx.blocks, start, TEXT_BLOCKS), last = deepestIndex(ctx.blocks, Math.max(start, end - 1), TEXT_BLOCKS);
    return first < 0 || last < 0 ? null : { ...base, startBlockId: ctx.ids[first], endBlockId: ctx.ids[last] };
  }
  if (annotation.scopeType !== 'selection' || end === start) return null;
  const from = pointFromSource(ctx, start, 'start'), to = pointFromSource(ctx, end, 'end');
  return from && to ? { ...base, start: from, end: to } : null;
}

function validPoint(ctx, point) {
  if (!point || typeof point.blockId !== 'string' || !Number.isInteger(point.offset)) return false;
  const index = ctx.ids.indexOf(point.blockId);
  if (index < 0) return false;
  return blockOffsetToSource(ctx.models[index], point, 'start') !== null;
}

/** 绑定是否可在当前正文上使用：引用的块存在且类型符合；选区偏移可换算。 */
export function validBinding(markdown, identity, binding) {
  const ctx = context(markdown, identity);
  if (!ctx || !binding || binding.formatVersion !== IDENTITY_BINDING_FORMAT) return false;
  const typeOf = id => ctx.blocks[ctx.ids.indexOf(id)]?.type;
  if (binding.scopeType === 'section') return typeOf(binding.rootBlockId) === 'heading';
  if (binding.scopeType === 'list') return typeOf(binding.rootBlockId) === 'listItem';
  if (binding.scopeType === 'blocks') return TEXT_BLOCKS.has(typeOf(binding.startBlockId)) && TEXT_BLOCKS.has(typeOf(binding.endBlockId));
  return binding.scopeType === 'selection' && validPoint(ctx, binding.start) && validPoint(ctx, binding.end);
}

/** 选区绑定换算回源码范围；不可用时返回 null。 */
export function bindingSourceRange(markdown, identity, binding) {
  if (binding?.scopeType !== 'selection' || !validBinding(markdown, identity, binding)) return null;
  const ctx = context(markdown, identity);
  const model = point => ctx.models[ctx.ids.indexOf(point.blockId)];
  const sourceStart = blockOffsetToSource(model(binding.start), binding.start, 'start');
  const sourceEnd = blockOffsetToSource(model(binding.end), binding.end, 'end');
  return sourceStart !== null && sourceEnd !== null && sourceEnd > sourceStart ? { sourceStart, sourceEnd } : null;
}

/** 编辑器在保存快照中上报的绑定；与当前正文和身份表一致时采用。 */
export function bindingFromEditor(markdown, identity, reported) {
  if (!reported?.present || !validIdentityTable(markdown, identity)) return null;
  const base = { formatVersion: IDENTITY_BINDING_FORMAT, contentHash: calculateContentHash(markdown), scopeType: reported.scopeType };
  const binding = reported.scopeType === 'selection' ? { ...base, start: reported.start, end: reported.end }
    : reported.scopeType === 'blocks' ? { ...base, startBlockId: reported.startBlockId, endBlockId: reported.endBlockId }
      : { ...base, rootBlockId: reported.rootBlockId };
  if (!validBinding(markdown, identity, binding)) return null;
  return reported.scopeType === 'selection' && !bindingSourceRange(markdown, identity, binding) ? null : binding;
}
