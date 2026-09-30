import { projectMarkdown, updateStructure, sourceEdits, applySourceEdit } from './index.js';
import { anchorForListItem, listTracking } from './list-anchor.js';

const result = (projection, anchor, status = 'resolved', reason = null) => ({ projection, anchor, status, reason,
  quoteText: anchor?.quoteText, segments: anchor?.segments });

export function followListAnchorChanges(before, after, original, edits = null, structures = {}) {
  let projection = projectMarkdown(before);
  let structure = structures.before ?? updateStructure(before, before);
  let anchor = structuredClone(original.pending?.anchor ?? original);
  // Archived annotations retain their historical subtree identities, while the note sidecar keeps evolving.
  // Seed only that known subtree and its ancestors; never recover identity from matching text.
  if (!structures.before && anchor.tracking?.rootId) {
    const members = structure.nodes.filter(node => node.path === anchor.structurePath || node.path.startsWith(`${anchor.structurePath}.`));
    const ancestors = projection.listItems.filter(item => anchor.structurePath.startsWith(`${item.path}.`));
    if (members.length === anchor.tracking.memberIds?.length) {
      members.forEach((node, index) => { node.id = anchor.tracking.memberIds[index]; });
    }
    const root = structure.nodes.find(node => node.path === anchor.structurePath && node.type === 'listItem');
    if (root) root.id = anchor.tracking.rootId;
    ancestors.forEach((item, index) => {
      const node = structure.nodes.find(node => node.path === item.path);
      if (node && anchor.tracking.ancestorItemIds?.[index]) node.id = anchor.tracking.ancestorItemIds[index];
    });
  }
  if (!anchor.tracking?.rootId) anchor.tracking = { ...anchor.tracking, ...listTracking(projection, anchor, structure) };
  const rootId = original.tracking?.rootId ?? anchor.tracking.rootId;
  const changes = edits ?? sourceEdits(before, after);
  let source = before;
  let outcome = result(projection, anchor);
  let pending = Boolean(original.pending);
  const snapshots = new Map([[before, { structure, anchor, outcome, pending }]]);
  for (const edit of changes) {
    const nextSource = applySourceEdit(source, edit);
    if (edit.history && snapshots.has(nextSource)) {
      ({ structure, anchor, outcome, pending } = structuredClone(snapshots.get(nextSource)));
      source = nextSource; continue;
    }
    const nextStructure = updateStructure(source, nextSource, structure, [edit]);
    const next = projectMarkdown(nextSource);
    const root = nextStructure.nodes.find(node => node.id === rootId && node.type === 'listItem');
    if (outcome.status === 'missing' && !anchor.tracking?.cut) {
      outcome = result(next, null, 'missing', 'sourceDeleted');
    } else if (!root || next.listItems.find(item => item.path === root.path)?.task) {
      const cut = edit.moveKind === 'cut' && edit.moveId && edit.from <= anchor.sourceStart && edit.to >= anchor.sourceEnd;
      const oldRoot = structure.nodes.find(node => node.id === rootId);
      const firstLeaf = projection.blocks.find(node => node.path.startsWith(`${oldRoot?.path}.`) && node.type === 'paragraph');
      const removed = edit.to > edit.from && !edit.text.trim()
        && ((edit.from <= anchor.sourceStart && edit.to >= anchor.sourceEnd)
          || (firstLeaf && edit.from <= firstLeaf.sourceStart && edit.to > firstLeaf.sourceEnd));
      if (cut) anchor = { ...anchor, tracking: { ...anchor.tracking, rootId, cut: { id: edit.moveId } } };
      outcome = result(next, cut ? anchor : null, removed || cut ? 'missing' : 'needsReview', removed || cut ? 'sourceDeleted' : 'listStructureChanged');
      pending ||= outcome.status === 'needsReview';
    } else {
      const candidate = anchorForListItem(next, root.path, true);
      const tracking = listTracking(next, candidate, nextStructure);
      const previousMembers = new Set(anchor.tracking?.memberIds ?? []);
      const oldIds = new Set(structure.nodes.map(node => node.id));
      const absorbed = tracking.memberIds.some(id => oldIds.has(id) && !previousMembers.has(id));
      const outsideMembers = (anchor.tracking?.memberIds ?? []).some(id => nextStructure.nodes.some(node => node.id === id)
        && !tracking.memberIds.includes(id));
      const ancestorsChanged = JSON.stringify(anchor.tracking?.ancestorItemIds ?? []) !== JSON.stringify(tracking.ancestorItemIds);
      pending ||= absorbed || outsideMembers || ancestorsChanged;
      anchor = { ...candidate, tracking: { ...anchor.tracking, ...tracking, rootId, cut: null,
        empty: !candidate.quoteText.trim() } };
      outcome = result(next, anchor, pending ? 'needsReview' : 'resolved', pending ? 'boundaryChanged' : null);
    }
    structure = nextStructure; projection = next; source = nextSource;
    snapshots.set(source, structuredClone({ structure, anchor, outcome, pending }));
  }
  if (source !== after) return result(projectMarkdown(after), null, 'needsReview', 'mappingMismatch');
  if (!structures.before && structures.after && outcome.anchor && outcome.status !== 'missing') {
    const actualRoot = structures.after.nodes.find(node => node.id === rootId && node.type === 'listItem');
    if (!actualRoot || actualRoot.path !== outcome.anchor.structurePath) return result(projectMarkdown(after), null, 'needsReview', 'listIdentityMissing');
    outcome.anchor.tracking = { ...outcome.anchor.tracking, ...listTracking(projectMarkdown(after), outcome.anchor, structures.after) };
  }
  // Without edit provenance, replacing an entire body cannot prove inherited identity.
  if (!edits && outcome.status === 'resolved' && !structure.nodes.some(node => node.id === rootId)) {
    return result(projectMarkdown(after), null, 'needsReview', 'listIdentityMissing');
  }
  return { ...outcome, projection: projectMarkdown(after) };
}
