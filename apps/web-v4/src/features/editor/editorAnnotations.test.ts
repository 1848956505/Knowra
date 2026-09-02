import { describe, expect, it } from 'vitest';
import { buildCreateAnnotationInput, buildUpdateAnnotationAnchorInput } from './annotationPayloads';

const selection = {
  quoteText: '这是一段重要结论',
  fromPosition: 5,
  toPosition: 14,
  prefixText: '前文',
  suffixText: '后文',
  headingPath: ['章节', '结论']
};

describe('editor annotation inputs', () => {
  it('creates stable content and anchor hashes for the backend contract', async () => {
    const input = await buildCreateAnnotationInput(
      { id: 'note-1', spaceId: 'space-1' },
      '# 章节\n\n这是一段重要结论',
      selection
    );

    expect(input).toMatchObject({
      noteId: 'note-1', spaceId: 'space-1', quoteText: selection.quoteText,
      kind: 'important', sourceMode: 'manual'
    });
    expect(input.noteContentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.anchorFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(input.idempotencyKey).toBeTruthy();
  });

  it('rebuilds a complete anchor payload when a selection is relocated', async () => {
    const input = await buildUpdateAnnotationAnchorInput('更新后的正文', selection);
    expect(input).toMatchObject(selection);
    expect(input.noteContentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.anchorFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects annotation creation when the note has no workspace id', async () => {
    await expect(buildCreateAnnotationInput({ id: 'note-1' }, '正文', selection))
      .rejects.toThrow('当前笔记缺少空间信息');
  });
});
