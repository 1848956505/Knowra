import { createAppError } from '../../../errors/app-error.js';

const INLINE_MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\(\s*<?(http:\/\/[^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gi;
const HTML_IMAGE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*(?:"(http:\/\/[^"]+)"|'(http:\/\/[^']+)'|(http:\/\/[^\s>]+))/gi;
const REFERENCE_IMAGE_PATTERN = /!\[[^\]]*]\[([^\]]+)]/gi;
const REFERENCE_DEFINITION_PATTERN = /^\s*\[([^\]]+)]:\s*<?(http:\/\/[^\s>]+)>?(?:\s+.*)?$/gim;

export function findInsecureImageUrls(markdown) {
  const source = typeof markdown === 'string' ? markdown : '';
  const urls = [];
  const imageReferenceIds = new Set();

  collectMatches(source, INLINE_MARKDOWN_IMAGE_PATTERN, (match) => match[1], urls);
  collectMatches(source, HTML_IMAGE_PATTERN, (match) => match[1] ?? match[2] ?? match[3], urls);
  collectMatches(source, REFERENCE_IMAGE_PATTERN, (match) => match[1], imageReferenceIds, normalizeReferenceId);
  collectMatches(source, REFERENCE_DEFINITION_PATTERN, (match) => {
    const referenceId = normalizeReferenceId(match[1]);
    return imageReferenceIds.has(referenceId) ? match[2] : null;
  }, urls);

  return [...new Set(urls)];
}

export function assertNoInsecureImageUrls(markdown) {
  const insecureUrls = findInsecureImageUrls(markdown);
  if (insecureUrls.length === 0) {
    return;
  }

  throw createAppError(
    'INSECURE_IMAGE_URL',
    '检测到不安全的 HTTP 图片地址。请先下载图片，再通过粘贴或上传保存为 Knowra 本地附件。',
    422
  );
}

function collectMatches(source, pattern, selectValue, target, normalize = (value) => value) {
  pattern.lastIndex = 0;
  let match = pattern.exec(source);
  while (match) {
    const value = selectValue(match);
    if (value) {
      target.add?.(normalize(value)) ?? target.push(normalize(value));
    }
    match = pattern.exec(source);
  }
}

function normalizeReferenceId(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}
