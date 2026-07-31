export const ATTACHMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  MISSING: 'missing',
  CORRUPT: 'corrupt',
  FAILED: 'failed'
});

export const ATTACHMENT_STATUS_VALUES = Object.freeze(
  Object.values(ATTACHMENT_STATUS)
);

export function isAttachmentStatus(value) {
  return ATTACHMENT_STATUS_VALUES.includes(value);
}

export function normalizeAttachmentStatus(value, fallback = ATTACHMENT_STATUS.READY) {
  return isAttachmentStatus(value) ? value : fallback;
}
