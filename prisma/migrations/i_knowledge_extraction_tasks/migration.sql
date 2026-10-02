-- 02B 私有任务描述，固定范围与 Mock 执行模式不扩充冻结 AIJob v1。
-- 核心候选/证据/接纳回执不依赖此私有扩展的外键或清理生命周期。
CREATE TABLE ai_knowledge_extraction_tasks (
  owner_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  descriptor_json TEXT NOT NULL,
  PRIMARY KEY (owner_id, dataset_id, job_id)
);
