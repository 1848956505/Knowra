import { ATTACHMENT_PARSE_LIMITS, parseError, ready } from './limits.mjs';
export async function parsePdf(buffer) {
  const { getDocument } = await import(process.env.KNOWRA_ATTACHMENT_PDFJS_URL ?? 'pdfjs-dist/legacy/build/pdf.mjs');
  // 不创建 viewer、scripting manager 或 renderTask；仅从内存取文字层。
  const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false,
    useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, useWasm: false,
    stopAtErrors: true, verbosity: 0, maxImageSize: 0, enableXfa: false,
    disableAutoFetch: true, disableStream: true });
  let document;
  try {
    document = await task.promise;
    if (!Number.isSafeInteger(document.numPages) || document.numPages > ATTACHMENT_PARSE_LIMITS.pdfPages) throw parseError('AI_ATTACHMENT_PAGE_LIMIT');
    let text = '', items = 0; const segments = [];
    for (let page = 1; page <= document.numPages; page++) {
      const pdfPage = await document.getPage(page);
      const stream = pdfPage.streamTextContent({ disableNormalization: false, includeMarkedContent: false });
      const reader = stream.getReader(); let pageText = '';
      try {
        for (;;) {
          const next = await reader.read(); if (next.done) break;
          for (const item of next.value.items) {
            if (++items > ATTACHMENT_PARSE_LIMITS.textItems) throw parseError('AI_ATTACHMENT_TEXT_LIMIT');
            if (typeof item.str !== 'string') continue;
            pageText += item.str + (item.hasEOL ? '\n' : ' ');
            if (text.length + pageText.length > ATTACHMENT_PARSE_LIMITS.textChars) throw parseError('AI_ATTACHMENT_TEXT_LIMIT');
          }
        }
      } finally { await reader.cancel().catch(() => {}); pdfPage.cleanup(); }
      pageText = pageText.trimEnd();
      if (text.length) text += '\n\n';
      const start = text.length; text += pageText;
      segments.push({ label: `第 ${page} 页`, page, start, end: text.length });
    }
    if (!text.trim()) throw parseError('AI_ATTACHMENT_PDF_NO_TEXT_LAYER');
    return ready('pdf', text, segments);
  } catch (error) {
    if (typeof error.code === 'string' && error.code.startsWith('AI_ATTACHMENT_')) throw error;
    if (error.name === 'PasswordException') throw parseError('AI_ATTACHMENT_ENCRYPTED');
    throw parseError('AI_ATTACHMENT_DOCUMENT_INVALID');
  } finally { await task.destroy().catch(() => {}); }
}
