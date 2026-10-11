export type AnnotationScopeType = 'selection' | 'blocks' | 'section' | 'list';
export interface NoteLinkLocator { targetNoteId: string; occurrenceId: string; }
export interface NoteLinkOccurrence extends NoteLinkLocator { url: string; sourceStart: number; sourceEnd: number; label: string; context: string; }
export function parseNoteLinkUrl(url: unknown): NoteLinkLocator | null;
export function createNoteLinkUrl(targetNoteId: string, occurrenceId: string): string;
export function extractNoteLinks(markdown: string): { targetIds: string[]; occurrences: NoteLinkOccurrence[] };
export function resolveNoteLinkOccurrence(markdown: string, locator: NoteLinkLocator): NoteLinkOccurrence | null;
export interface AnchorSegment { start: number; end: number; path: string; }
export interface ContentAnchor {
  tracking?: { formatVersion?: number; empty?: boolean; emptyPosition?: number; emptyType?: string; [key: string]: unknown };
  pending?: { anchor: ContentAnchor; contentHash: string; reason: string } | null;
  projectionVersion: number;
  scopeType: AnnotationScopeType;
  segments: AnchorSegment[];
  structurePath: string | null;
  quoteText: string;
  prefixText: string;
  suffixText: string;
  sourceStart: number;
  sourceEnd: number;
  projectedStart: number;
  projectedEnd: number;
  list?: { itemPath: string; parentItemPath: string | null; depth: number; ordered: boolean; childCount: number; memberFingerprint: string };
  section?: { headingLevel: number; title: string; sourceStart: number; sourceEnd: number; endBoundaryPath: string | null; endBoundaryLevel: number | null; endBoundaryTitle: string | null; memberFingerprint: string; };
}
export interface ListItemProjection { path: string; parentListPath: string; parentItemPath: string | null; depth: number; ordered: boolean; task: boolean; sourceStart: number; sourceEnd: number }
export interface MarkdownProjection {
  listItems: ListItemProjection[];
  version: number; source: string; contentHash: string; text: string;
  units: Array<{ text: string; sourceStart: number | null; sourceEnd: number | null; projectedStart: number; projectedEnd: number; path: string; atomic?: boolean }>;
  blocks: Array<{ sourceStart: number; sourceEnd: number; path: string; type: string }>;
  headings: Array<{ sourceStart: number; sourceEnd: number; path: string; level: number; title: string }>;
  sections: Array<{ sourceStart: number; sourceEnd: number; path: string; level: number; title: string }>;
}
export const MARKDOWN_PROJECTION_VERSION: number;
export function calculateContentHash(markdown: string): string;
export function projectMarkdown(markdown: string): MarkdownProjection;
export function anchorFromProjectedRange(projection: MarkdownProjection, start: number, end: number, options?: { scopeType?: AnnotationScopeType; structurePath?: string }): ContentAnchor;
export function anchorForSourceRange(projection: MarkdownProjection, start: number, end: number, options?: { scopeType?: AnnotationScopeType; structurePath?: string }): ContentAnchor;
export function anchorForBlock(projection: MarkdownProjection, blockIndex: number): ContentAnchor;
export function anchorForSection(projection: MarkdownProjection, headingIndex: number): ContentAnchor;
export function resolveAnchor(markdown: string, anchor: ContentAnchor): { status: 'resolved' | 'needsReview' | 'missing'; reason: string | null; anchor?: ContentAnchor; projection: MarkdownProjection; quoteText?: string; segments?: AnchorSegment[] };
export function relocateAnchor(markdown: string, anchor: ContentAnchor): ReturnType<typeof resolveAnchor> & { candidates?: ContentAnchor[] };
export function followSectionAnchor(markdown: string, anchor: ContentAnchor): ReturnType<typeof resolveAnchor>;
export function headingPathForSourceOffset(projection: MarkdownProjection, sourceOffset: number): string[];

export interface SourceEdit { from: number; to: number; text: string; history?: boolean; moveId?: string; moveKind?: 'cut' | 'paste'; preserveEmptyBlock?: boolean; deletedEmptyAnnotationIds?: string[] }
export interface AnnotationMapping { formatVersion: 1; operationId: string; baseContentHash: string; targetContentHash: string; baseStructureRevision?: number; edits: SourceEdit[]; editorState?: IdentityEditorState }

/** 稳定身份迁移影子阶段：编辑器在保存时上报的身份视角快照。 */
export interface IdentityEditorBlock { id: string; type: string; empty: boolean }
export interface IdentityEditorAnnotation {
  id: string; scopeType: AnnotationScopeType; present: boolean;
  rootBlockId?: string; startBlockId?: string; endBlockId?: string; quoteText?: string;
}
export interface IdentityEditorState { formatVersion: 2; targetContentHash: string; blocks: IdentityEditorBlock[]; annotations: IdentityEditorAnnotation[] }
export type IdentityShadowDivergenceKind = 'trackedLost' | 'oldNeedsReview' | 'identityLost' | 'blockMismatch' | 'quoteMismatch';
export interface IdentityShadowDivergence { annotationId: string; scopeType: AnnotationScopeType; kind: IdentityShadowDivergenceKind; oldStatus: string | null; oldReason: string | null }
export interface IdentityShadowResult {
  status: 'compared' | 'invalidState' | 'stateMismatch' | 'alignFailed'; compared: number; divergences: IdentityShadowDivergence[];
  alignment?: { editorIndex: number; markdownIndex: number; editorType: string | null; markdownType: string | null };
}
export const IDENTITY_SHADOW_FORMAT: 2;
export const EDITOR_TO_MARKDOWN_BLOCK: Readonly<Record<string, string>>;
export function parseIdentityBlocks(markdown: string): Array<{ type: string; depth: number; sourceStart: number; sourceEnd: number; br: boolean }>;
export function alignIdentityBlocks(markdownBlocks: ReturnType<typeof parseIdentityBlocks>, editorBlocks: IdentityEditorBlock[]): { aligned: true; pairs: Map<number, number> } | { aligned: false; editorIndex: number; markdownIndex: number; editorType: string | null; markdownType: string | null };
export function validIdentityEditorState(state: unknown): state is IdentityEditorState;
export function compareIdentityShadow(input: { markdown: string; editorState: unknown; annotations: Array<Record<string, any>> }): IdentityShadowResult;
export interface AnnotationStructure { formatVersion: 1; revision: number; contentHash: string; nodes: Array<{ id: string; path: string; type: string; sourceStart: number; sourceEnd: number }> }
export function sourceEdit(before: string, after: string): SourceEdit;
export function applySourceEdit(source: string, edit: SourceEdit): string;
export function verifiedSourceEdits(before: string, after: string, mapping?: AnnotationMapping): SourceEdit[] | null;
export function followAnchorChanges(before: string, after: string, anchor: ContentAnchor, edits?: SourceEdit[] | null): ReturnType<typeof resolveAnchor>;
export function updateStructure(before: string, after: string, previous?: AnnotationStructure | null, edits?: SourceEdit[] | null): AnnotationStructure;
export function sourceEdits(before: string, after: string): SourceEdit[];

export function anchorForListItem(projection: MarkdownProjection, itemPath: string, allowEmpty?: boolean): ContentAnchor;
export function followListAnchor(markdown: string, anchor: ContentAnchor): ReturnType<typeof resolveAnchor>;
export function listTracking(projection: MarkdownProjection, anchor: ContentAnchor, structure?: AnnotationStructure | null): NonNullable<ContentAnchor['tracking']>;
export function followListAnchorChanges(before: string, after: string, anchor: ContentAnchor, edits?: SourceEdit[] | null, structures?: { before?: AnnotationStructure | null; after?: AnnotationStructure | null }): ReturnType<typeof resolveAnchor>;
