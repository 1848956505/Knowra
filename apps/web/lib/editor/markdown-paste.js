import { Fragment, Slice } from '@milkdown/kit/prose/model';

const MARKDOWN_BLOCK_PATTERNS = [
  /^\s{0,3}#{1,6}\s+/m,
  /^\s{0,3}```/m,
  /^\s{0,3}~~~+/m,
  /^\s{0,3}>\s+/m,
  /^\s{0,3}(?:[-*+] |\d+\. )/m,
  /^\s{0,3}\|.+\|\s*$/m
];

export function looksLikeMarkdown(text) {
  const source = typeof text === 'string' ? text : '';
  return MARKDOWN_BLOCK_PATTERNS.some((pattern) => pattern.test(source));
}

export function shouldPreferPlainMarkdown({ text, vscodeData } = {}) {
  if (vscodeData || !text) {
    return false;
  }

  return looksLikeMarkdown(text);
}

function sanitizeFragment(fragment) {
  const children = [];
  let changed = false;

  for (let index = 0; index < fragment.childCount; index += 1) {
    const node = fragment.child(index);
    const nextNode = index + 1 < fragment.childCount ? fragment.child(index + 1) : null;
    const isSpuriousEmptyCodeBlock = node.type.name === 'code_block'
      && node.textContent.trim() === ''
      && nextNode?.type.name === 'code_block'
      && nextNode.textContent.trim() !== '';

    if (isSpuriousEmptyCodeBlock) {
      changed = true;
      continue;
    }

    const sanitizedContent = node.content.size > 0 ? sanitizeFragment(node.content) : node.content;
    if (sanitizedContent !== node.content) {
      children.push(node.copy(sanitizedContent));
      changed = true;
    } else {
      children.push(node);
    }
  }

  return changed ? Fragment.fromArray(children) : fragment;
}

export function removeSpuriousEmptyCodeBlocks(slice) {
  if (!slice?.content) {
    return slice;
  }

  const content = sanitizeFragment(slice.content);
  return content === slice.content
    ? slice
    : new Slice(content, slice.openStart, slice.openEnd);
}
