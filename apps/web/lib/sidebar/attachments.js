export function buildAttachmentContentUrl(attachmentId) {
  if (!attachmentId) {
    return '';
  }

  return `/api/storage/attachments/${encodeURIComponent(attachmentId)}/content`;
}

export function isAttachmentReferencedInMarkdown(attachment, markdown = '') {
  const contentUrl = buildAttachmentContentUrl(attachment?.id);
  if (!contentUrl) {
    return false;
  }

  return String(markdown ?? '').includes(contentUrl);
}

export function decorateAttachmentsForDisplay(attachments = [], markdown = '') {
  return attachments.map((attachment) => ({
    ...attachment,
    contentUrl: buildAttachmentContentUrl(attachment?.id),
    isReferenced: isAttachmentReferencedInMarkdown(attachment, markdown)
  }));
}
