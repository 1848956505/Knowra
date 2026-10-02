import fs from 'node:fs';
import { knowledgeExtractionCommitKey, validateKnowledgeExtractionCommit } from '../../api/src/modules/ai/knowledge-extraction-commit-contract.js';

/** 核心提交扩展独立版本；原库备份后升级，不改变可选 AI user_version。 */
export function createSqliteKnowledgeExtractionCommitStore(db, filePath, runTransaction) {
  const version = db.prepare("SELECT value FROM metadata WHERE key = 'knowledgeExtractionCommitsVersion'").get()?.value;
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_extraction_commits'").get();
  if (version === undefined) {
    if (exists) throw new Error('未标记版本的提炼提交表不能自动覆盖。');
    const backup = `${filePath}.before-knowledge-extraction-commits-v1-${Date.now()}.bak`;
    db.prepare('VACUUM INTO ?').run(backup);
    fs.chmodSync(backup, 0o600);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE knowledge_extraction_commits (
        owner_id TEXT NOT NULL, dataset_id TEXT NOT NULL, job_id TEXT NOT NULL,
        receipt_json TEXT NOT NULL, PRIMARY KEY (owner_id, dataset_id, job_id)
      ); INSERT INTO metadata VALUES ('knowledgeExtractionCommitsVersion', '1'); COMMIT;`);
    } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  } else if (version !== '1' || !exists) throw new Error('提炼提交存储版本或结构无效。');
  validateSqliteKnowledgeExtractionCommits(db);
  return {
    supportsAsync: false,
    runTransaction(operation) {
      if (db.isTransaction) throw new TypeError('提炼接纳必须拥有最外层事务，不能嵌套提交。');
      return runTransaction(operation);
    },
    get(input) {
      const row = db.prepare('SELECT * FROM knowledge_extraction_commits WHERE owner_id = ? AND dataset_id = ? AND job_id = ?')
        .get(input.ownerId, input.datasetId, input.jobId);
      return row ? decode(row) : null;
    },
    insert: receipt => db.prepare('INSERT INTO knowledge_extraction_commits VALUES (?, ?, ?, ?)')
      .run(receipt.ownerId, receipt.datasetId, receipt.jobId, JSON.stringify(receipt))
  };
}

function decode(row) {
  const receipt = validateKnowledgeExtractionCommit(JSON.parse(row.receipt_json));
  if (knowledgeExtractionCommitKey(receipt) !== knowledgeExtractionCommitKey({ ownerId: row.owner_id,
    datasetId: row.dataset_id, jobId: row.job_id })) throw new Error('提炼提交索引与内容不一致。');
  return receipt;
}

export function validateSqliteKnowledgeExtractionCommits(db) {
  const version = db.prepare("SELECT value FROM metadata WHERE key = 'knowledgeExtractionCommitsVersion'").get()?.value;
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_extraction_commits'").get();
  if (version === undefined && !exists) return;
  if (version !== '1' || !exists) throw new Error('提炼提交存储版本或结构无效。');
  db.prepare('SELECT * FROM knowledge_extraction_commits').all().forEach(decode);
}
