import { crc32 } from 'node:zlib';
import { ATTACHMENT_PARSE_LIMITS, decodeUtf8, parseError, ready } from './limits.mjs';

/** 先逐项展开并核大小/CRC，后交给成熟 Word 解析器；不写入任何 ZIP 路径。 */
async function inspectDocx(buffer) {
  const { default: yauzl } = await import(process.env.KNOWRA_ATTACHMENT_YAUZL_URL ?? 'yauzl');
  let zip;
  try { zip = await yauzl.fromBufferPromise(buffer, { validateEntrySizes: true, strictFileNames: true }); }
  catch { throw parseError('AI_ATTACHMENT_DOCUMENT_INVALID'); }
  if (zip.entryCount > ATTACHMENT_PARSE_LIMITS.zipEntries) throw parseError('AI_ATTACHMENT_ARCHIVE_LIMIT');
  const names = new Set(); let declaredBytes = 0, actualBytes = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      if (!name || name.length > 240 || /[\u0000-\u001f\\:]/.test(name) || name.startsWith('/')
        || name.split('/').some(part => part === '..' || part === '.') || names.has(name.toLowerCase())) throw parseError('AI_ATTACHMENT_ARCHIVE_PATH_INVALID');
      names.add(name.toLowerCase());
      if ((entry.generalPurposeBitFlag & 1) !== 0) throw parseError('AI_ATTACHMENT_ENCRYPTED');
      const mode = entry.externalFileAttributes >>> 16;
      if ((mode & 0xf000) === 0xa000) throw parseError('AI_ATTACHMENT_ARCHIVE_PATH_INVALID');
      if (![0, 8].includes(entry.compressionMethod)) throw parseError('AI_ATTACHMENT_DOCUMENT_INVALID');
      declaredBytes += entry.uncompressedSize;
      if (entry.uncompressedSize > ATTACHMENT_PARSE_LIMITS.entryBytes || declaredBytes > ATTACHMENT_PARSE_LIMITS.expandedBytes
        || entry.uncompressedSize > Math.max(1024, entry.compressedSize * ATTACHMENT_PARSE_LIMITS.compressionRatio)) throw parseError('AI_ATTACHMENT_EXPANSION_LIMIT');
      if (name.endsWith('/')) continue;
      const stream = await zip.openReadStreamPromise(entry);
      let bytes = 0, checksum = 0; const chunks = [];
      const xml = /(?:\.xml|\.rels)$/i.test(name);
      for await (const chunk of stream) {
        bytes += chunk.length; actualBytes += chunk.length;
        if (bytes > ATTACHMENT_PARSE_LIMITS.entryBytes || actualBytes > ATTACHMENT_PARSE_LIMITS.expandedBytes) {
          stream.destroy(); throw parseError('AI_ATTACHMENT_EXPANSION_LIMIT');
        }
        checksum = crc32(chunk, checksum);
        if (xml) chunks.push(chunk);
      }
      if (bytes !== entry.uncompressedSize || checksum !== entry.crc32) throw parseError('AI_ATTACHMENT_DOCUMENT_INVALID');
      if (xml) {
        const content = decodeUtf8(Buffer.concat(chunks));
        if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(content)) throw parseError('AI_ATTACHMENT_XML_UNSAFE');
        // 外部超链接可保留可见文字；外部图像、模板和其他文件关系不接受。
        for (const [element] of content.matchAll(/<Relationship\b[^>]*>/g)) {
          if (/TargetMode\s*=\s*["']External["']/i.test(element)
            && !/Type\s*=\s*["'][^"']*\/hyperlink["']/i.test(element)) throw parseError('AI_ATTACHMENT_EXTERNAL_REFERENCE');
        }
      }
    }
  } catch (error) {
    if (error.code?.startsWith('AI_ATTACHMENT_')) throw error;
    throw parseError('AI_ATTACHMENT_DOCUMENT_INVALID');
  } finally { zip.close(); }
  if (!names.has('[content_types].xml') || !names.has('word/document.xml')) throw parseError('AI_ATTACHMENT_DOCUMENT_INVALID');
}
export async function parseDocx(buffer) {
  await inspectDocx(buffer);
  const { default: mammoth } = await import(process.env.KNOWRA_ATTACHMENT_MAMMOTH_URL ?? 'mammoth');
  let result;
  // extractRawText 只接受 input；外部文件访问沿用库的关闭默认值，另有预检和权限屏障。
  try { result = await mammoth.extractRawText({ buffer }); }
  catch { throw parseError('AI_ATTACHMENT_DOCUMENT_INVALID'); }
  if (result.messages?.some(message => message.type === 'error')) throw parseError('AI_ATTACHMENT_DOCUMENT_INVALID');
  const text = result.value;
  const segments = []; let start = 0;
  for (const paragraph of text.split('\n\n')) {
    if (paragraph.trim()) segments.push({ label: `段落 ${segments.length + 1}`, start, end: start + paragraph.length });
    start += paragraph.length + 2;
  }
  return ready('docx', text, segments);
}
