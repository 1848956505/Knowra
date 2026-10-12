// Public compatibility surface; internal modules use implementations directly.
export { MARKDOWN_PROJECTION_VERSION, projectMarkdown, anchorFromProjectedRange, anchorForSourceRange, anchorForBlock, anchorForSection, headingPathForSourceOffset } from './projection.js';
export { calculateContentHash } from './hash.js';
export { resolveAnchor, relocateAnchor, followSectionAnchor } from './anchor-resolution.js';
export { sourceEdit, applySourceEdit } from './source-edit.js';
export { parseNoteLinkUrl, createNoteLinkUrl, extractNoteLinks, resolveNoteLinkOccurrence } from './internal-links.js';
export { verifiedSourceEdits, followAnchorChanges, updateStructure } from './dynamic.js';
export { sourceEdits } from './source-diff.js';

export { anchorForListItem, followListAnchor, listTracking } from './list-anchor.js';
export { followListAnchorChanges } from './list-follow.js';
export { IDENTITY_SHADOW_FORMAT, EDITOR_TO_MARKDOWN_BLOCK, parseIdentityBlocks, alignIdentityBlocks, validIdentityEditorState, compareIdentityShadow, identityQuoteHash, identityFromEditorState, validIdentityTable, adoptIdentityIds } from './identity-shadow.js';
export { identityBlockModels, blockOffsetToSource, sourceToBlockOffset } from './block-offsets.js';
export { IDENTITY_BINDING_FORMAT, bindingFromAnchor, bindingFromEditor, bindingSourceRange, validBinding } from './identity-binding.js';
