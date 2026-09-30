import { sourceEdits } from './source-diff.js';
import { listIdentityCandidates } from './list-identity.js';
import { projectMarkdown, calculateContentHash, anchorForSourceRange, anchorForSection } from './index.js';

// Each edit is relative to the preceding source, never to ProseMirror coordinates.
export function sourceEdit(before, after) {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let to = before.length, end = after.length;
  while (to > from && end > from && before[to - 1] === after[end - 1]) { to--; end--; }
  return { from, to, text: after.slice(from, end) };
}
export function applySourceEdit(source, edit) {
  if (!edit || !Number.isInteger(edit.from) || !Number.isInteger(edit.to) || edit.from < 0
    || edit.to < edit.from || edit.to > source.length || typeof edit.text !== 'string') throw new RangeError('Invalid source edit');
  return source.slice(0, edit.from) + edit.text + source.slice(edit.to);
}
export function verifiedSourceEdits(before, after, mapping) {
  if (!mapping) return null;
  if (mapping.formatVersion !== 1 || !mapping.operationId || mapping.baseContentHash !== calculateContentHash(before)
    || mapping.targetContentHash !== calculateContentHash(after) || !Array.isArray(mapping.edits) || mapping.edits.length > 10000) return null;
  try {
    let value = before;
    for (const edit of mapping.edits) value = applySourceEdit(value, edit);
    return value === after ? mapping.edits : null;
  } catch { return null; }
}
function mapPoint(value, edit, association) {
  const delta = edit.text.length - (edit.to - edit.from);
  if (edit.to > edit.from && value === edit.to) return edit.from + edit.text.length;
  if (edit.to > edit.from && value === edit.from) return edit.from;
  if (value < edit.from || (value === edit.from && association < 0)) return value;
  if (value > edit.to || (value === edit.to && association > 0)) return value + delta;
  return edit.from + (association > 0 ? edit.text.length : 0);
}
function mapRange(start, end, edit, allowReplacement) {
  if (edit.from <= start && edit.to >= end && edit.to > edit.from) {
    if (allowReplacement && edit.from === start && edit.to === end && edit.text.length) return { start, end: start + edit.text.length };
    return null;
  }
  return { start: mapPoint(start, edit, 1), end: mapPoint(end, edit, -1) };
}
function rootBlocks(projection) {
  return projection.blocks.filter(block => !projection.blocks.some(parent => parent !== block && block.path.startsWith(parent.path + '.')));
}
function containingBlocks(projection, anchor) {
  const covered = projection.blocks.filter(block => block.sourceStart <= anchor.sourceStart && block.sourceEnd >= anchor.sourceEnd);
  // Prefer the explicitly selected container; a quote/list item is larger than its leaf paragraphs.
  const exact = covered.find(block => block.path === anchor.structurePath);
  if (exact) return [exact];
  const members = rootBlocks(projection).filter(block => block.sourceEnd > anchor.sourceStart && block.sourceStart < anchor.sourceEnd);
  return members;
}
function result(projection, anchor, reason = null, status = 'resolved') {
  return { status, reason, projection, anchor, quoteText: anchor?.quoteText, segments: anchor?.segments };
}
function emptyAnchor(projection, block, previous) {
  return { ...previous, scopeType: 'blocks', structurePath: block.path, sourceStart: block.sourceStart,
    sourceEnd: block.sourceEnd, segments: [], quoteText: '', projectedStart: 0, projectedEnd: 0,
    tracking: { ...previous.tracking, empty: true } };
}

/** Reconcile against an immutable old version. Ambiguous whole replacements without edit provenance are never inherited. */
function followEdits(before, after, original, edits = null) {
  const oldProjection = projectMarkdown(before);
  let anchor = structuredClone(original);
  let source = before;
  const changes = edits ?? sourceEdits(before, after);
  if (before === after && !edits?.length) return result(oldProjection, anchor);
  for (const edit of changes) {
    const nextSource = applySourceEdit(source, edit);
    const old = projectMarkdown(source), next = projectMarkdown(nextSource);
    if (anchor.quoteText && !edit.text && edit.to > edit.from) {
      const raw = source.slice(anchor.sourceStart, anchor.sourceEnd);
      const first = raw && source.indexOf(raw);
      if (raw && first >= 0 && source.indexOf(raw, first + raw.length) >= 0 && source.slice(edit.from, edit.to).includes(raw)) {
        return result(next, null, 'ambiguousMatch', 'needsReview');
      }
    }
    if (anchor.tracking?.empty) {
      const position = anchor.tracking.emptyPosition ?? anchor.sourceStart;
      const candidates = next.blocks.filter(block => block.type === anchor.tracking.emptyType && block.sourceStart >= edit.from && block.sourceStart <= edit.from + edit.text.length);
      if (edit.text.trim() && edit.from <= position && edit.to >= position && candidates.length === 1) {
        anchor = { ...anchorForSourceRange(next, candidates[0].sourceStart, candidates[0].sourceEnd, { scopeType: 'blocks', structurePath: candidates[0].path }), tracking: { ...anchor.tracking, empty: false } };
      } else {
        const mapped = mapPoint(position, edit, -1);
        anchor = { ...anchor, sourceStart: mapped, sourceEnd: mapped, tracking: { ...anchor.tracking, emptyPosition: mapped } };
      }
      source = nextSource; continue;
    }
    if (anchor.scopeType === 'section') {
      const oldHeading = old.headings.find(h => h.path === anchor.structurePath);
      if (!oldHeading) return result(next, null, 'sectionIdentityMissing', 'needsReview');
      const headingRange = mapRange(oldHeading.sourceStart, oldHeading.sourceEnd, edit, Boolean(edits));
      if (headingRange && edit.from === oldHeading.sourceStart && edit.to === edit.from && /^#+$/.test(edit.text)) headingRange.start = edit.from;
      if (!headingRange) return result(next, null, 'sectionDeleted', 'missing');
      const matches = next.headings.filter(h => h.sourceStart === headingRange.start);
      if (matches.length !== 1) return result(next, null, 'sectionIdentityMissing', 'needsReview');
      const heading = matches[0];
      const index = next.sections.findIndex(s => s.path === heading.path);
      let candidate;
      try { candidate = anchorForSection(next, index); }
      catch (error) { if (error.code !== 'ANNOTATION_RANGE_INVALID') throw error; return result(next, null, 'sourceDeleted', 'missing'); }
      const oldSection = old.sections.find(s => s.path === oldHeading.path);
      const oldBoundary = old.headings.find(h => h.path === oldSection.endBoundaryPath);
      const boundaryRange = oldBoundary && mapRange(oldBoundary.sourceStart, oldBoundary.sourceEnd, edit, Boolean(edits));
      const boundary = boundaryRange && next.headings.find(h => h.sourceStart === boundaryRange.start);
      const nextSection = next.sections[index];
      const sameBoundary = oldBoundary ? boundary && nextSection.endBoundaryPath === boundary.path
        && boundary.level === oldBoundary.level : nextSection.endBoundaryPath === null;
      if (heading.level !== oldHeading.level || !sameBoundary) return result(next, candidate, 'boundaryChanged', 'needsReview');
      anchor = { ...candidate, tracking: anchor.tracking };
    } else {
      const blocks = anchor.scopeType === 'blocks' ? containingBlocks(old, anchor) : [];
      const start = anchor.sourceStart, end = anchor.sourceEnd;
      if (edit.moveKind === 'cut' && edit.moveId && edit.from <= start && edit.to >= end) return result(next, null, 'sourceDeleted', 'missing');
      if (blocks.length === 1 && edit.preserveEmptyBlock && /^\s*<br\s*\/?>(?:\s*)$/i.test(edit.text) && edit.from <= start && edit.to >= end) {
        const block = next.blocks.find(block => block.sourceStart === edit.from);
        if (block) {
          anchor = { ...emptyAnchor(next, block, anchor), tracking: { ...anchor.tracking, empty: true, emptyPosition: block.sourceStart, emptyType: blocks[0].type } };
          source = nextSource; continue;
        }
      }
      let range = mapRange(start, end, edit, Boolean(edits));
      if (!range || range.start >= range.end) {
        if (edit.preserveEmptyBlock && blocks.length === 1 && ['paragraph', 'code'].includes(blocks[0].type)
          && !edit.text.trim() && edit.from <= start && edit.to >= end) {
          const position = Math.min(edit.from, nextSource.length);
          anchor = { ...anchor, quoteText: '', segments: [], sourceStart: position, sourceEnd: position,
            tracking: { ...anchor.tracking, empty: true, emptyPosition: position, emptyType: blocks[0].type } };
          source = nextSource; continue;
        }
        // Empty fenced code retains a structural node. Empty paragraphs do not exist in Markdown.
        const block = blocks.length === 1 && next.blocks.find(b => b.path === blocks[0].path && b.type === blocks[0].type);
        if (block && blocks[0].type === 'code' && edit.from >= blocks[0].sourceStart && edit.to <= blocks[0].sourceEnd) {
          anchor = emptyAnchor(next, block, anchor); source = nextSource; continue;
        }
        return result(next, null, 'sourceDeleted', 'missing');
      }
      let scopeType = anchor.scopeType;
      let structurePath;
      if (blocks.length) {
        const first = blocks[0], last = blocks.at(-1);
        const mappedStart = mapPoint(first.sourceStart, edit, -1);
        const mappedEnd = mapPoint(last.sourceEnd, edit, 1);
        const candidates = next.blocks.filter(b => b.sourceEnd > range.start && b.sourceStart < range.end);
        const containers = candidates.filter(b => !candidates.some(p => p !== b && b.path.startsWith(p.path + '.')));
        // Merging with an unmarked neighbour must not expand to that neighbour.
        if (containers.some(b => b.sourceStart < mappedStart || b.sourceEnd > mappedEnd)) scopeType = 'selection';
        else if (containers.length) {
          range = { start: containers[0].sourceStart, end: containers.at(-1).sourceEnd };
          structurePath = containers[0].path;
        }
      }
      try {
        anchor = { ...anchorForSourceRange(next, range.start, range.end, { scopeType, structurePath }), tracking: anchor.tracking };
      } catch (error) {
        if (error.code !== 'ANNOTATION_RANGE_INVALID') throw error;
        return result(next, null, 'sourceDeleted', 'missing');
      }
    }
    source = nextSource;
  }
  if (source !== after) return result(projectMarkdown(after), null, 'mappingMismatch', 'needsReview');
  return result(projectMarkdown(after), anchor, anchor.scopeType !== original.scopeType ? 'convertedToSelection' : null);
}

// Internal sidecar: copied/inserted structures receive fresh identities; revisions live beside immutable annotation revisions.
export function updateStructure(before, after, previous = null, edits = null) {
  const revision = (previous?.revision ?? 0) + 1;
  let source = before;
  let nodes = projectMarkdown(before).blocks.map(block => ({ ...block,
    id: previous?.nodes?.find(node => node.path === block.path)?.id ?? `block-${calculateContentHash(`${calculateContentHash(before)}:0:${block.path}`).slice(0,24)}` }));
  let cuts = [...(previous?.cuts ?? [])];
  const changes = edits?.length ? edits : [sourceEdit(before, after)];
  for (const [step, edit] of changes.entries()) {
    const nextSource = applySourceEdit(source, edit);
    const next = projectMarkdown(nextSource);
    const old = projectMarkdown(source);
    if (edit.moveKind === 'cut' && edit.moveId && (!edit.text.trim() || /^\s*<br\s*\/?>\s*$/i.test(edit.text))) {
      cuts = nodes.filter(node => node.sourceStart >= edit.from && node.sourceEnd <= edit.to).map(node => ({
        ...node, moveId: edit.moveId, text: source.slice(edit.from,edit.to), relativeStart: node.sourceStart-edit.from, relativeEnd: node.sourceEnd-edit.from
      }));
    }
    const mapped = nodes.map(node => ({ node, range: mapRange(node.sourceStart,node.sourceEnd,edit,Boolean(edits)) }));
    const assigned = new Set();
    nodes = next.blocks.map(block => {
      let candidates = mapped.filter(({node,range}) => range && node.type === block.type && range.start === block.sourceStart && range.end === block.sourceEnd).map(({node})=>node);
      if (!candidates.length) candidates = listIdentityCandidates(block, nodes, old, next, edit, mapRange, mapPoint);
      if (edit.moveKind === 'paste' && edit.moveId) {
        candidates = candidates.concat(cuts.filter(cut => {
          const text = cut.text.trim(), index = edit.text.indexOf(text);
          const leading = cut.text.length-cut.text.trimStart().length;
          return cut.moveId === edit.moveId && text && index >= 0 && edit.text.indexOf(text,index+1)<0
            && cut.type === block.type && block.sourceStart === edit.from+index+cut.relativeStart-leading && block.sourceEnd === edit.from+index+cut.relativeEnd-leading;
        }));
      }
      const inherited = candidates.length === 1 && !assigned.has(candidates[0].id) ? candidates[0].id : null;
      const id = inherited ?? `block-${calculateContentHash(`${next.contentHash}:${revision}:${step}:${block.path}`).slice(0,24)}`;
      assigned.add(id);
      return {...block,id};
    });
    if (edit.moveKind === 'paste') cuts = cuts.filter(cut => cut.moveId !== edit.moveId);
    source = nextSource;
  }
  return { formatVersion: 1, revision, contentHash: calculateContentHash(after), nodes, cuts };
}

/** Replay operation provenance, retaining deletion tombstones until an explicit undo or matching one-shot move. */
export function followAnchorChanges(before, after, original, edits = null) {
  const changes = edits ?? sourceEdits(before, after);
  if (!changes.length) return result(projectMarkdown(after), original);
  let source = before;
  let anchor = structuredClone(original);
  let outcome = result(projectMarkdown(before), anchor);
  const snapshots = new Map([[before, structuredClone(outcome)]]);
  let boundaryChanged = false;
  for (const edit of changes) {
    const next = applySourceEdit(source, edit);
    if (edit.history && snapshots.has(next)) {
      outcome = structuredClone(snapshots.get(next));
      anchor = outcome.anchor ?? anchor;
      boundaryChanged = outcome.status === 'needsReview';
    } else if (anchor.tracking?.cut) {
      const cut = anchor.tracking.cut;
      const text = cut.text.trim();
      const match = edit.text.indexOf(text);
      if (edit.moveKind === 'paste' && edit.moveId === cut.id && text && match >= 0 && edit.text.indexOf(text, match + 1) < 0) {
        const leading = cut.text.length - cut.text.trimStart().length;
        const start = edit.from + match + cut.start - leading;
        const end = edit.from + match + cut.end - leading;
        const projection = projectMarkdown(next);
        try {
          let moved = anchorForSourceRange(projection, start, end, { scopeType: anchor.scopeType });
          if (anchor.scopeType === 'section') {
            const index = projection.sections.findIndex(section => section.sourceStart <= start && projection.headings.find(h => h.path === section.path)?.sourceEnd >= start);
            if (index < 0) throw new RangeError('Missing moved heading');
            moved = anchorForSection(projection, index);
            if (moved.quoteText !== original.quoteText) boundaryChanged = true;
          }
          anchor = { ...moved, tracking: { ...anchor.tracking, cut: null } };
          outcome = result(projection, anchor);
        } catch { outcome = result(projection, anchor, 'moveUnverified', 'needsReview'); }
      } else outcome = result(projectMarkdown(next), anchor, 'sourceDeleted', 'missing');
    } else if (outcome.status !== 'missing') {
      const previous = anchor;
      outcome = followEdits(source, next, anchor, edits ? [edit] : null);
      if (outcome.status === 'missing' && edit.moveKind === 'cut' && edit.moveId
        && edit.from <= previous.sourceStart && edit.to >= previous.sourceEnd && (!edit.text.trim() || /^\s*<br\s*\/?>\s*$/i.test(edit.text))) {
        anchor = { ...previous, tracking: { ...previous.tracking, cut: { id: edit.moveId, text: source.slice(edit.from, edit.to), start: previous.sourceStart - edit.from, end: previous.sourceEnd - edit.from } } };
        outcome = result(projectMarkdown(next), anchor, 'sourceDeleted', 'missing');
      } else anchor = outcome.anchor ?? anchor;
      if (outcome.reason === 'boundaryChanged') boundaryChanged = true;
    }
    source = next;
    snapshots.set(source, structuredClone(outcome));
  }
  if (source !== after) return result(projectMarkdown(after), null, 'mappingMismatch', 'needsReview');
  if (boundaryChanged && outcome.status === 'resolved') return result(projectMarkdown(after), anchor, 'boundaryChanged', 'needsReview');
  if (!edits && original.scopeType === 'selection' && outcome.status === 'resolved' && outcome.anchor.quoteText !== original.quoteText) {
    return result(projectMarkdown(after), outcome.anchor, 'contentChanged', 'needsReview');
  }
  return { ...outcome, projection: projectMarkdown(after) };
}
