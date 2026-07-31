import fs from 'node:fs';
import { ATTACHMENT_STATUS } from './attachment-status.js';
import { sha256FileSync } from './local-attachment-store-utils.js';

export function reconcileAttachmentIntegrity(
  attachment,
  filePath,
  { now = new Date().toISOString() } = {}
) {
  if (!attachment?.id) {
    return false;
  }

  const previous = {
    size: attachment.size,
    sha256: attachment.sha256 ?? null,
    status: attachment.status ?? ATTACHMENT_STATUS.READY,
    verifiedAt: attachment.verifiedAt ?? null
  };

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    attachment.status = ATTACHMENT_STATUS.MISSING;
    attachment.verifiedAt = null;
    return hasChanged(attachment, previous);
  }

  const stats = fs.statSync(filePath);
  const actualSha256 = sha256FileSync(filePath);
  const expectedSha256 = normalizeSha256(attachment.sha256);
  if (expectedSha256 && expectedSha256 !== actualSha256) {
    attachment.status = ATTACHMENT_STATUS.CORRUPT;
    attachment.verifiedAt = null;
    return hasChanged(attachment, previous);
  }

  attachment.size = stats.size;
  attachment.sha256 = actualSha256;
  attachment.status = ATTACHMENT_STATUS.READY;
  attachment.verifiedAt = new Date(now).toISOString();
  return hasChanged(attachment, previous);
}

export function normalizeSha256(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function hasChanged(attachment, previous) {
  return attachment.size !== previous.size
    || (attachment.sha256 ?? null) !== previous.sha256
    || attachment.status !== previous.status
    || (attachment.verifiedAt ?? null) !== previous.verifiedAt;
}
