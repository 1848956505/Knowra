/** An item owns its first leaf. Boundary insertions must not discard its identity. */
export function listIdentityCandidates(block, nodes, oldProjection, nextProjection, edit, mapRange, mapPoint) {
  if (block.type !== 'listItem') return [];
  const firstLeaf = (projection, path) => projection.blocks.find(item => item.path.startsWith(`${path}.`)
    && ['paragraph', 'heading', 'code', 'html'].includes(item.type));
  const nextLeaf = firstLeaf(nextProjection, block.path);
  return nodes.filter(node => {
    if (node.type !== 'listItem') return false;
    if (edit.to > edit.from && !edit.text && edit.from <= node.sourceStart && edit.to >= node.sourceEnd) return false;
    const leaf = firstLeaf(oldProjection, node.path);
    if (leaf && nextLeaf) {
      const mapped = mapRange(leaf.sourceStart, leaf.sourceEnd, edit, true);
      // Inserting at a leaf's start/last character still belongs to the same item.
      const start = edit.from === leaf.sourceStart && edit.to === edit.from ? leaf.sourceStart : mapped?.start;
      return start === nextLeaf.sourceStart;
    }
    const start = mapPoint(node.sourceStart, edit, -1);
    const end = mapPoint(node.sourceEnd, edit, 1);
    return start === block.sourceStart && end === block.sourceEnd;
  });
}
