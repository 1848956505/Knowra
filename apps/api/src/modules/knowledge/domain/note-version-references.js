/**
 * 把引用方记录里的标识符收集成集合，判断版本是否被引用（按版本 ID 或正文哈希）。
 * 与逐类字段检查不同，新增引用字段不会漏判；代价只是偶尔多保留一些版本。
 */
export function createNoteVersionReferenceIndex(collections) {
  const tokens = new Set();
  for (const records of Object.values(collections)) {
    for (const record of records ?? []) {
      for (const match of JSON.stringify(record).matchAll(/[A-Za-z0-9_-]+/g)) {
        if (tokens.has(match[0])) continue;
        // 正则子串在部分 V8 版本中持有整条 JSON 的底层字符串。
        // 分离标识符，避免引用索引额外保活所有历史修订的序列化正文。
        tokens.add(Buffer.from(match[0], 'utf8').toString('utf8'));
      }
    }
  }
  return (version) => tokens.has(version.id) || tokens.has(version.contentHash);
}
