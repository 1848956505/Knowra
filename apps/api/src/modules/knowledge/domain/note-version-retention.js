const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const NOTE_VERSION_RETENTION = Object.freeze({
  recentMs: DAY,
  dailyUntilMs: 30 * DAY,
  maxPerNote: 100
});

const bucketOf = (age, createdAt, policy) => {
  const time = Date.parse(createdAt);
  return age <= policy.dailyUntilMs ? `d${Math.floor(time / DAY)}` : `w${Math.floor(time / (7 * DAY))}`;
};

/**
 * 分层稀疏化：24 小时内全留；其后 30 天内每天留最后一个；更早每周留最后一个；
 * 每篇笔记总数不超过上限（从最旧的未受保护版本开始删）。受保护版本永远保留且计入总数。
 * 返回应删除的版本 ID。
 */
export function selectVersionsToPrune({ versions, now = Date.now(), protectedIds = new Set(), policy = NOTE_VERSION_RETENTION }) {
  const ordered = [...versions].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id));
  const kept = new Set();
  const seen = new Set();
  for (const version of ordered) {
    const age = now - Date.parse(version.createdAt);
    if (protectedIds.has(version.id) || age <= policy.recentMs) { kept.add(version.id); continue; }
    const bucket = bucketOf(age, version.createdAt, policy);
    if (seen.has(bucket)) continue;
    seen.add(bucket); kept.add(version.id);
  }
  // 上限：保留列表按新到旧，超出部分从最旧的未受保护版本删除。
  let overflow = kept.size - policy.maxPerNote;
  for (let index = ordered.length - 1; overflow > 0 && index >= 0; index--) {
    const version = ordered[index];
    if (kept.has(version.id) && !protectedIds.has(version.id)) { kept.delete(version.id); overflow--; }
  }
  return ordered.filter((version) => !kept.has(version.id)).map((version) => version.id);
}
