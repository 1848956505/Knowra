import { calculateContentHash, type ContentAnchor } from '@study-accelerator/content-anchor';
import type { CreateAnnotationInput, UpdateAnnotationAnchorInput } from '@study-accelerator/web-core';

export interface AnnotationSelection {
  quoteText: string;
  fromPosition: number;
  toPosition: number;
  prefixText: string;
  suffixText: string;
  headingPath: string[];
  scopeType: 'selection' | 'blocks' | 'section';
  anchor: ContentAnchor;
}

export async function buildCreateAnnotationInput(note: { id: string; spaceId?: string }, markdown: string, selection: AnnotationSelection): Promise<CreateAnnotationInput> {
  if (!note.spaceId) throw new Error('当前笔记缺少空间信息');
  const noteContentHash = calculateContentHash(markdown);
  return {
    spaceId: note.spaceId,
    noteId: note.id,
    ...selection,
    anchorFingerprint: calculateContentHash(JSON.stringify({ segments: selection.anchor.segments, structurePath: selection.anchor.structurePath })),
    noteContentHash,
    idempotencyKey: crypto.randomUUID(),
    kind: 'important',
    schemaVersion: 2,
    sourceMode: 'manual'
  };
}

export async function buildUpdateAnnotationAnchorInput(markdown: string, selection: AnnotationSelection, expectedRevision: number): Promise<UpdateAnnotationAnchorInput> {
  return {
    ...selection,
    anchorFingerprint: calculateContentHash(JSON.stringify({ segments: selection.anchor.segments, structurePath: selection.anchor.structurePath })),
    noteContentHash: calculateContentHash(markdown),
    expectedRevision
  };
}
