/**
 * 把引用方记录里的标识符收集成集合，判断版本是否被引用（按版本 ID 或正文哈希）。
 * 与逐类字段检查不同，新增引用字段不会漏判；代价只是偶尔多保留一些版本。
 */
export function createNoteVersionReferenceIndex(collections) {
  const tokens = new Set();
  for (const records of Object.values(collections)) {
    for (const record of records ?? []) {
      for (const match of JSON.stringify(record).matchAll(/[A-Za-z0-9_-]+/g)) tokens.add(match[0]);
    }
  }
  return (version) => tokens.has(version.id) || tokens.has(version.contentHash);
}
