import {
  buildAttachmentContentUrl,
  extractAttachmentIdFromUrl
} from '../../../lib/sidebar/attachments.js';
import { writeClipboardText } from '../../../lib/browser/clipboard.js';

export function createAttachmentCommandsController({ elements, flashStatus }) {

  function findAttachmentReferenceTarget(attachmentId) {
    if (!attachmentId || !elements.editorContent) {
      return null;
    }

    const directMatch = elements.editorContent.querySelector(
      `[data-attachment-id="${escapeAttachmentSelector(attachmentId)}"]`
    );
    if (directMatch instanceof HTMLElement) {
      return directMatch;
    }

    const candidates = elements.editorContent.querySelectorAll('img[src], a[href]');
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) {
        continue;
      }

      const source = candidate.getAttribute('src')
        ?? candidate.getAttribute('href')
        ?? (candidate instanceof HTMLImageElement ? candidate.currentSrc : '');
      if (extractAttachmentIdFromUrl(source) === attachmentId) {
        return candidate;
      }
    }

    return null;
  }

  function jumpToAttachmentReference(attachmentId) {
    const target = findAttachmentReferenceTarget(attachmentId);
    if (!target) {
      flashStatus('当前附件尚未在正文中找到引用位置');
      return false;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }

  function openAttachment(attachmentId) {
    const contentUrl = buildAttachmentContentUrl(attachmentId);
    if (!contentUrl) {
      flashStatus('当前附件缺少可打开的内容地址');
      return false;
    }

    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(contentUrl, '_blank', 'noopener');
      return true;
    }

    flashStatus('当前环境暂不支持打开附件');
    return false;
  }

  async function copyAttachmentLink(attachmentId) {
    const contentUrl = buildAttachmentContentUrl(attachmentId);
    if (!contentUrl) {
      flashStatus('当前附件缺少可复制的内容地址');
      return false;
    }

    const copied = await writeClipboardText(contentUrl);
    flashStatus(copied ? '已复制附件链接' : '复制附件链接失败');
    return copied;
  }

  return {
    findAttachmentReferenceTarget,
    jumpToAttachmentReference,
    openAttachment,
    copyAttachmentLink
  };
}

function escapeAttachmentSelector(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return String(value).replace(/"/g, '\\"');
}
