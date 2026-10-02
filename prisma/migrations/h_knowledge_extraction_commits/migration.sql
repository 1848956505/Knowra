-- AI-03-02A：与候选/证据同事务的执行宿主提交记录；不复用问答 result_json。
CREATE TABLE knowledge_extraction_commits (
  owner_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,
  receipt_json JSONB NOT NULL,
  PRIMARY KEY (owner_id, dataset_id, job_id)
);
