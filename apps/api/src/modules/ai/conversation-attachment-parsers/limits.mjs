export const ATTACHMENT_PARSE_LIMITS = Object.freeze({
  fileBytes: 5 * 1024 * 1024, expandedBytes: 12 * 1024 * 1024,
  entryBytes: 4 * 1024 * 1024, zipEntries: 256, compressionRatio: 100,
  textChars: 200_000, segments: 2000, pdfPages: 100, textItems: 100_000,
  imagePixels: 20_000_000, imageDimension: 12_000,
  wallTimeMs: 8_000, cpuSeconds: 8, heapMiB: 96,
  addressSpaceBytes: 896 * 1024 * 1024, outputBytes: 2 * 1024 * 1024,
  concurrentParsers: 2
});
export function parseError(code) { return Object.assign(new Error(code), { code }); }
export function failed(kind, errorCode) { return { kind, status: 'failed', text: '', segments: [], errorCode }; }
export function unsupported(kind, errorCode, extra = {}) { return { kind, status: 'unsupported', text: '', segments: [], errorCode, ...extra }; }
export function ready(kind, text, segments) {
  if (text.length > ATTACHMENT_PARSE_LIMITS.textChars) throw parseError('AI_ATTACHMENT_TEXT_LIMIT');
  if (segments.length > ATTACHMENT_PARSE_LIMITS.segments) throw parseError('AI_ATTACHMENT_SEGMENT_LIMIT');
  if (!text.isWellFormed()) throw parseError('AI_ATTACHMENT_ENCODING_INVALID');
  if (!text.trim()) throw parseError('AI_ATTACHMENT_NO_TEXT');
  return { kind, status: 'ready', text, segments };
}
export function decodeUtf8(buffer) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (/[\u0000-\u0008\u000b\u000e-\u001f]/.test(text)) throw parseError('AI_ATTACHMENT_BINARY_TEXT');
    return text;
  } catch (error) {
    if (typeof error.code === 'string' && error.code.startsWith('AI_ATTACHMENT_')) throw error;
    throw parseError('AI_ATTACHMENT_ENCODING_INVALID');
  }
}
