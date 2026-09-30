/** Preserve AST ancestry independently of rendered list numbers and editor positions. */
export function collectListItems(tree) {
  const items = [];
  function visit(node, path, ancestors) {
    if (node.type === 'listItem' && node.position) {
      const list = ancestors.at(-1);
      const parents = ancestors.filter(entry => entry.node.type === 'listItem');
      items.push({
        path: path.join('.'), parentListPath: list.path.join('.'),
        parentItemPath: parents.at(-1)?.path.join('.') ?? null,
        depth: parents.length, ordered: Boolean(list.node.ordered),
        task: typeof node.checked === 'boolean',
        sourceStart: node.position.start.offset, sourceEnd: node.position.end.offset
      });
    }
    node.children?.forEach((child, index) => visit(child, [...path, index], [...ancestors, { node, path }]));
  }
  visit(tree, [], []);
  return items;
}
