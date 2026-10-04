import { inspectAttachment } from './file-type.mjs';
import { ATTACHMENT_PARSE_LIMITS, failed, unsupported, ready, decodeUtf8, parseError } from './limits.mjs';
import { disableParserNetwork } from './offline-guard.mjs';
import { validateImage } from './images.mjs';
disableParserNetwork();
// stdout 只承担有界结果协议，供应商库日志不能混入协议或泄漏附件原文。
for (const key of ['log', 'warn', 'info', 'error', 'debug']) console[key] = () => {};
let kind = 'unknown';
try {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > ATTACHMENT_PARSE_LIMITS.fileBytes + 1024) throw parseError('AI_ATTACHMENT_FILE_LIMIT');
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks), separator = input.indexOf(10);
  if (separator < 0 || separator > 1024) throw parseError('AI_ATTACHMENT_INPUT_INVALID');
  const metadata = JSON.parse(input.subarray(0, separator).toString('utf8'));
  const buffer = input.subarray(separator + 1), info = inspectAttachment({ ...metadata, buffer }); kind = info.kind;
  let result;
  if (kind === 'doc') result = unsupported('doc', 'AI_ATTACHMENT_DOC_UNSUPPORTED');
  else if (kind === 'image') result = validateImage(buffer, info.extension);
  else if (kind === 'docx') result = await (await import('./docx.mjs')).parseDocx(buffer);
  else if (kind === 'pdf') result = await (await import('./pdf.mjs')).parsePdf(buffer);
  else { const text = decodeUtf8(buffer); result = ready(kind, text, [{ label: kind === 'markdown' ? 'Markdown 正文' : '文本正文', start: 0, end: text.length }]); }
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  const code = /^AI_ATTACHMENT_[A-Z_]{1,64}$/.test(error.code) ? error.code : 'AI_ATTACHMENT_DOCUMENT_INVALID';
  process.stdout.write(JSON.stringify(failed(kind, code)));
}
