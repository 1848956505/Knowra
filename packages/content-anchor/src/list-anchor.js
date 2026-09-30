import { anchorForSourceRange, calculateContentHash, projectMarkdown, MARKDOWN_PROJECTION_VERSION } from './index.js';

const failure = message => Object.assign(new RangeError(message), { code: 'ANNOTATION_RANGE_INVALID' });

export function anchorForListItem(projection, itemPath, allowEmpty = false) {
  const item = projection.listItems.find(candidate => candidate.path === itemPath);
  if (!item || item.task) throw failure('普通列表项不存在');
  let anchor;
  try {
    anchor = anchorForSourceRange(projection, item.sourceStart, item.sourceEnd, { scopeType: 'list', structurePath: item.path });
  } catch (error) {
    if (!allowEmpty || error.code !== 'ANNOTATION_RANGE_INVALID') throw error;
    anchor = { projectionVersion: MARKDOWN_PROJECTION_VERSION, scopeType: 'list', structurePath: item.path,
      segments: [], quoteText: '', prefixText: '', suffixText: '', projectedStart: 0, projectedEnd: 0,
      tracking: { empty: true, emptyType: 'listItem' } };
  }
  if (!allowEmpty && !anchor.quoteText.trim()) throw failure('空列表项不能标记为重点');
  const members = projection.blocks.filter(block => block.path === item.path || block.path.startsWith(`${item.path}.`));
  return { ...anchor, sourceStart: item.sourceStart, sourceEnd: item.sourceEnd,
    list: { itemPath: item.path, parentItemPath: item.parentItemPath, depth: item.depth, ordered: item.ordered,
      childCount: projection.listItems.filter(child => child.path.startsWith(`${item.path}.`)).length,
      memberFingerprint: calculateContentHash(members.map(block => `${block.type}:${block.path.slice(item.path.length)}`).join('|')) } };
}

export function listTracking(projection, anchor, structure) {
  const item = projection.listItems.find(candidate => candidate.path === anchor.structurePath);
  const nodes = structure?.nodes ?? [];
  const root = nodes.find(node => node.type === 'listItem' && node.path === item?.path);
  const ancestors = projection.listItems.filter(parent => item?.path.startsWith(`${parent.path}.`));
  return { formatVersion: 1, structureRevision: structure?.revision ?? 0,
    rootId: root?.id ?? null,
    ancestorItemIds: ancestors.map(parent => nodes.find(node => node.path === parent.path)?.id).filter(Boolean),
    memberIds: nodes.filter(node => node.path === item?.path || node.path.startsWith(`${item?.path}.`)).map(node => node.id) };
}

export function resolveListAnchor(projection, anchor) {
  const fail = (reason, status = 'needsReview') => ({ status, reason, projection });
  if (anchor.projectionVersion !== MARKDOWN_PROJECTION_VERSION) return fail('projectionVersionMismatch');
  if (!anchor.list || anchor.list.itemPath !== anchor.structurePath) return fail('listIdentityMissing');
  let candidate;
  try { candidate = anchorForListItem(projection, anchor.structurePath, Boolean(anchor.tracking?.empty)); }
  catch (error) { if (error.code !== 'ANNOTATION_RANGE_INVALID') throw error; return fail('listStructureChanged'); }
  if (candidate.sourceStart !== anchor.sourceStart || candidate.sourceEnd !== anchor.sourceEnd
    || candidate.quoteText !== anchor.quoteText || candidate.segments.length !== anchor.segments?.length
    || candidate.segments.some((segment, index) => {
      const stored = anchor.segments[index];
      return segment.start !== stored.start || segment.end !== stored.end || segment.path !== stored.path;
    })) return fail('listRangeChanged');
  if (candidate.list.parentItemPath !== anchor.list.parentItemPath || candidate.list.depth !== anchor.list.depth
    || candidate.list.memberFingerprint !== anchor.list.memberFingerprint) return fail('boundaryChanged');
  return { status: 'resolved', reason: null, projection, anchor: { ...candidate, tracking: anchor.tracking },
    quoteText: candidate.quoteText, segments: candidate.segments };
}

/** No text-based relocation: a stale path must never attach to an identical sibling. */
export function followListAnchor(markdown, anchor) {
  return resolveListAnchor(projectMarkdown(markdown), anchor);
}
