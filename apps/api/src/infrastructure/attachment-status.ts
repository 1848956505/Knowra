export const ATTACHMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  MISSING: 'missing',
  CORRUPT: 'corrupt',
  FAILED: 'failed'
});

export const ATTACHMENT_STATUS_VALUES = Object.freeze(Object.values(ATTACHMENT_STATUS));

export type AttachmentStatus = (typeof ATTACHMENT_STATUS)[keyof typeof ATTACHMENT_STATUS];

// 只描述标准内建 includes 的布尔结果，不把未知输入声明为类型守卫。
export function isAttachmentStatus(value: unknown): boolean {
  return (ATTACHMENT_STATUS_VALUES as readonly unknown[]).includes(value);
}

// 返回值保留输入与 fallback 的静态信息；unknown 不因成员检查而自动收窄。
export function normalizeAttachmentStatus<Value>(
  value: Value,
  fallback?: undefined
): Value | typeof ATTACHMENT_STATUS.READY;
export function normalizeAttachmentStatus<Value, Fallback>(
  value: Value,
  fallback: Fallback
): Value | Exclude<Fallback, undefined> | (undefined extends Fallback ? typeof ATTACHMENT_STATUS.READY : never);
export function normalizeAttachmentStatus(value: unknown, fallback: unknown = ATTACHMENT_STATUS.READY): unknown {
  return isAttachmentStatus(value) ? value : fallback;
}
