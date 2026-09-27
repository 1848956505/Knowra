-- v2 私有授权记录与 v1 固定任务并存；不从旧 grant 生成持续策略。
CREATE TABLE ai_access_policies (
  policy_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  dataset_epoch TEXT NOT NULL,
  space_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  record_hash TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE INDEX ai_access_policies_owner ON ai_access_policies(owner_id, dataset_id, dataset_epoch, space_id);

CREATE TABLE ai_run_grants (
  grant_id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES ai_access_policies(policy_id),
  owner_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  dataset_epoch TEXT NOT NULL,
  space_id TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE INDEX ai_run_grants_policy ON ai_run_grants(policy_id);

CREATE TABLE ai_request_manifests (
  manifest_id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES ai_run_grants(grant_id),
  owner_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  dataset_epoch TEXT NOT NULL,
  space_id TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE INDEX ai_request_manifests_grant ON ai_request_manifests(grant_id);
