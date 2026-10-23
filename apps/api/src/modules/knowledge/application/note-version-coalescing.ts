/** 只比较原始字段，不验证或归一化历史版本；返回仍是 versions 中的原对象。 */
export interface CoalescingVersionInput {
  id?: unknown;
  noteId?: unknown;
  createdAt?: unknown;
  createdBy?: unknown;
  contentHash?: unknown;
  /** 供实际调用者比较前像；不保证字段存在或内容格式。 */
  content?: unknown;
}

export interface CoalescingVersionOptions<Version extends CoalescingVersionInput> {
  versions: readonly Version[];
  current: CoalescingVersionInput;
  windowMs?: unknown;
}

// 局部调用视图仅保留原生转换/动态方法，不能证明字段已经是字符串或有效日期。
type NativeDateParser = (value: unknown) => number;
type LocaleComparable = { localeCompare(value: unknown): number };

/** 连续自动保存在窗口内只保留一个检查点；超过窗口后上一个版本成为永久保留的检查点。 */
export const NOTE_VERSION_COALESCE_WINDOW_MS = 10 * 60 * 1000;

const time = (value: unknown): number => (Date.parse as NativeDateParser)(value);

/**
 * 返回可被新版本取代的上一个版本，否则返回 null。
 * - 上一个版本必须是同一笔记中除新版本外最新的版本，且两者都由用户自动保存产生；
 * - 它之前必须还有一个版本（首个版本是基线，不合并）；
 * - 新版本与更早那个检查点的间隔仍在窗口内，窗口一过上一个版本就保留下来。
 */
export function selectCoalescibleVersion<Version extends CoalescingVersionInput>({
  versions,
  current,
  windowMs = NOTE_VERSION_COALESCE_WINDOW_MS
}: CoalescingVersionOptions<Version>): Version | null {
  const others = versions
    .filter(item => item.noteId === current.noteId && item.id !== current.id)
    .sort(
      (left, right) =>
        time(right.createdAt) - time(left.createdAt) || (right.id as LocaleComparable).localeCompare(left.id)
    );
  const [previous, checkpoint] = others;
  if (!previous || !checkpoint) return null;
  if (previous.createdBy !== 'user' || current.createdBy !== 'user') return null;
  if (!(time(current.createdAt) > time(previous.createdAt)) || previous.contentHash === current.contentHash)
    return null;
  return time(current.createdAt) - time(checkpoint.createdAt) < (windowMs as number) ? previous : null;
}
