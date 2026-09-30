export type AnnotationScopeType = 'selection' | 'blocks' | 'section' | 'list';
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
export interface AnnotationMapping { formatVersion: 1; operationId: string; baseContentHash: string; targetContentHash: string; baseStructureRevision?: number; edits: SourceEdit[] }
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
