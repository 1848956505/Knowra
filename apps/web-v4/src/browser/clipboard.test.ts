import { describe, expect, it, vi } from 'vitest';
import { readClipboardText, runDocumentCommand, writeClipboardText } from './clipboard';

describe('clipboard helpers', () => {
  it('reuses the async clipboard APIs when available', async () => {
    const readText = vi.fn().mockResolvedValue('# pasted');
    const writeText = vi.fn().mockResolvedValue(undefined);
    const navigatorRef = { clipboard: { readText, writeText } } as unknown as Navigator;
    await expect(readClipboardText({ navigatorRef })).resolves.toEqual({ ok: true, text: '# pasted' });
    await expect(writeClipboardText('copied', { navigatorRef })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('copied');
  });

  it('reports denied reads and safely wraps legacy document commands', async () => {
    const navigatorRef = { clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) } } as unknown as Navigator;
    await expect(readClipboardText({ navigatorRef })).resolves.toEqual({ ok: false, reason: 'denied' });
    const documentRef = { execCommand: vi.fn().mockReturnValue(true) } as unknown as Document;
    expect(runDocumentCommand('copy', { documentRef })).toBe(true);
    expect(documentRef.execCommand).toHaveBeenCalledWith('copy');
  });
});
