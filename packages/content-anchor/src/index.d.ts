export type AnnotationScopeType = 'selection' | 'blocks' | 'section';
export interface AnchorSegment { start: number; end: number; path: string; }
export interface ContentAnchor {
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
  section?: { headingLevel: number; title: string; sourceStart: number; sourceEnd: number; endBoundaryPath: string | null; endBoundaryLevel: number | null; endBoundaryTitle: string | null; memberFingerprint: string; };
}
export interface MarkdownProjection {
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
