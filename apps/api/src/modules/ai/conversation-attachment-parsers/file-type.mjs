import { extname } from 'node:path';
import { ATTACHMENT_PARSE_LIMITS, parseError } from './limits.mjs';
const definitions = {
  '.txt': ['text', ['text/plain']], '.md': ['markdown', ['text/markdown', 'text/plain', 'text/x-markdown']],
  '.markdown': ['markdown', ['text/markdown', 'text/plain', 'text/x-markdown']],
  '.docx': ['docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  '.doc': ['doc', ['application/msword']], '.pdf': ['pdf', ['application/pdf']],
  '.png': ['image', ['image/png']], '.jpg': ['image', ['image/jpeg']], '.jpeg': ['image', ['image/jpeg']]
};
export function inspectAttachment({ buffer, fileName, mimeType }) {
  if (!Buffer.isBuffer(buffer) || typeof fileName !== 'string' || !fileName || fileName.length > 200
    || /[\u0000-\u001f/\\]/.test(fileName) || typeof mimeType !== 'string' || mimeType.length > 200) throw parseError('AI_ATTACHMENT_INPUT_INVALID');
  if (!buffer.length) throw parseError('AI_ATTACHMENT_EMPTY');
  if (buffer.length > ATTACHMENT_PARSE_LIMITS.fileBytes) throw parseError('AI_ATTACHMENT_FILE_LIMIT');
  const extension = extname(fileName).toLowerCase(), definition = definitions[extension];
  if (!definition) throw parseError('AI_ATTACHMENT_TYPE_UNSUPPORTED');
  const [kind, mimes] = definition;
  const parts = mimeType.toLowerCase().split(';').map(item => item.trim());
  const mime = parts[0];
  if (mime && !mimes.includes(mime)) throw parseError('AI_ATTACHMENT_MIME_MISMATCH');
  if (parts.slice(1).some(part => !/^charset=(?:utf-8|"utf-8")$/.test(part))) throw parseError('AI_ATTACHMENT_ENCODING_INVALID');
  const starts = value => buffer.subarray(0, value.length).equals(value);
  const pdf = starts(Buffer.from('%PDF-'));
  const zip = starts(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const ole = starts(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const png = starts(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = starts(Buffer.from([0xff, 0xd8, 0xff]));
  if (kind === 'docx' && ole) throw parseError('AI_ATTACHMENT_ENCRYPTED');
  if ((kind === 'text' || kind === 'markdown') && (pdf || zip || ole || png || jpeg)
    || kind === 'pdf' && !pdf || kind === 'docx' && !zip
    || kind === 'image' && (extension === '.png' ? !png : !jpeg)) throw parseError('AI_ATTACHMENT_MIME_MISMATCH');
  return { kind, mimeType: mime || mimes[0], extension };
}
