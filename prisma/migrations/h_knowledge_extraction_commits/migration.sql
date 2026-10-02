-- AI-03-02A：与候选/证据同事务的执行宿主提交记录；不复用问答 result_json。
-- 冻结提炼 v1 的 outputHash 依赖 JSON 序列，TEXT 保留键序，不能用 JSONB 重排。
CREATE TABLE knowledge_extraction_commits (
  owner_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  PRIMARY KEY (owner_id, dataset_id, job_id)
);
