import { gzipSync, gunzipSync } from 'node:zlib';
import { LOCAL_DATA_COLLECTIONS } from '../../infrastructure/local-data-schema.js';
import { syncKey, syncError } from './journal.js';

const PAGE_SIZE = 100;
export function compactSnapshotEntries(state, journal) {
  const current = new Map();
  for (const collection of LOCAL_DATA_COLLECTIONS) for (const item of state[collection] ?? []) current.set(syncKey(collection, item.id), item);
  const entryPages = [];
  let page = [], count = 0;
  const flush = () => {
    entryPages.push(gzipSync(JSON.stringify(page)).toString('base64'));
    page = [];
  };
  for (const [key, revision] of Object.entries(journal.revisions)) {
    const [collection, id] = JSON.parse(key);
    page.push({ collection, id, revision, value: current.get(key) ?? null });
    count++;
    if (page.length === PAGE_SIZE) flush();
  }
  if (page.length) flush();
  return { entriesEncoding: 'gzip-pages-v1', entryPageSize: PAGE_SIZE, entryPages, count };
}

export function readCompactSnapshot(snapshot, start, end) {
  if (snapshot.entriesEncoding !== 'gzip-pages-v1' || snapshot.entryPageSize !== PAGE_SIZE
    || !Array.isArray(snapshot.entryPages) || snapshot.entryPages.length !== Math.ceil(snapshot.count / PAGE_SIZE)) {
    throw syncError('SYNC_SNAPSHOT_CONTRACT_MISMATCH', '快照分页结构无效。');
  }
  const entries = [];
  try {
    for (let index = Math.floor(start / PAGE_SIZE); index < Math.ceil(end / PAGE_SIZE); index++) {
      const page = JSON.parse(gunzipSync(Buffer.from(snapshot.entryPages[index], 'base64')).toString('utf8'));
      if (!Array.isArray(page) || page.length !== Math.min(PAGE_SIZE, snapshot.count - index * PAGE_SIZE)) throw new Error('page count');
      entries.push(...page.slice(Math.max(0, start - index * PAGE_SIZE), Math.min(PAGE_SIZE, end - index * PAGE_SIZE)));
    }
  } catch {
    throw syncError('SYNC_SNAPSHOT_CONTRACT_MISMATCH', '快照分页内容无效。');
  }
  return entries;
}
