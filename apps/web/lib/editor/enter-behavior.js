const STRUCTURED_BLOCK_TYPES = new Set(['list_item', 'blockquote', 'code_block']);
const TRAILING_BLANK_ELIGIBLE_TYPES = new Set(['paragraph', 'heading']);

export function shouldKeepTrailingBlank({
  docIsEmpty,
  atDocEnd,
  currentBlockIsBlank,
  trailingBlankCount,
  parentType = 'paragraph'
}) {
  if (docIsEmpty || !atDocEnd || currentBlockIsBlank) {
    return false;
  }

  if (!TRAILING_BLANK_ELIGIBLE_TYPES.has(parentType)) {
    return false;
  }

  return Number(trailingBlankCount ?? 0) === 0;
}

export function resolveEnterBehavior({
  parentType,
  parentIsBlank
}) {
  if (!STRUCTURED_BLOCK_TYPES.has(parentType)) {
    return 'default';
  }

  return parentIsBlank ? 'exit-structured-block' : 'continue-structured-block';
}
