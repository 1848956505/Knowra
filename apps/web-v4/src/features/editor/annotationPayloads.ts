import type { CreateAnnotationInput, UpdateAnnotationAnchorInput } from '@study-accelerator/web-core';

export interface AnnotationSelection {
  quoteText: string;
  fromPosition: number;
  toPosition: number;
  prefixText: string;
  suffixText: string;
  headingPath: string[];
}

export async function buildCreateAnnotationInput(note: { id: string; spaceId?: string }, markdown: string, selection: AnnotationSelection): Promise<CreateAnnotationInput> {
  if (!note.spaceId) throw new Error('当前笔记缺少空间信息');
  const noteContentHash = await hashText(markdown);
  return {
    spaceId: note.spaceId,
    noteId: note.id,
    ...selection,
    anchorFingerprint: await hashText(`${selection.quoteText}\n${selection.prefixText}\n${selection.suffixText}`),
    noteContentHash,
    idempotencyKey: crypto.randomUUID(),
    kind: 'important',
    sourceMode: 'manual'
  };
}

export async function buildUpdateAnnotationAnchorInput(markdown: string, selection: AnnotationSelection): Promise<UpdateAnnotationAnchorInput> {
  return {
    ...selection,
    anchorFingerprint: await hashText(`${selection.quoteText}\n${selection.prefixText}\n${selection.suffixText}`),
    noteContentHash: await hashText(markdown)
  };
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
