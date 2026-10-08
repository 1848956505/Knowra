/** 连续自动保存在窗口内只保留一个检查点；超过窗口后上一个版本成为永久保留的检查点。 */
export const NOTE_VERSION_COALESCE_WINDOW_MS = 5 * 60 * 1000;

const time = (value) => Date.parse(value);

/**
 * 返回可被新版本取代的上一个版本，否则返回 null。
 * - 上一个版本必须是同一笔记中除新版本外最新的版本，且两者都由用户自动保存产生；
 * - 它之前必须还有一个版本（首个版本是基线，不合并）；
 * - 新版本与更早那个检查点的间隔仍在窗口内，窗口一过上一个版本就保留下来。
 */
export function selectCoalescibleVersion({ versions, current, windowMs = NOTE_VERSION_COALESCE_WINDOW_MS }) {
  const others = versions
    .filter((item) => item.noteId === current.noteId && item.id !== current.id)
    .sort((left, right) => time(right.createdAt) - time(left.createdAt) || right.id.localeCompare(left.id));
  const [previous, checkpoint] = others;
  if (!previous || !checkpoint) return null;
  if (previous.createdBy !== 'user' || current.createdBy !== 'user') return null;
  if (!(time(current.createdAt) > time(previous.createdAt)) || previous.contentHash === current.contentHash) return null;
  return time(current.createdAt) - time(checkpoint.createdAt) < windowMs ? previous : null;
}
