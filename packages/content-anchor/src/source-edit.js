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
