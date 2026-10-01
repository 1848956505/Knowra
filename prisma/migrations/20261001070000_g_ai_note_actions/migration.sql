-- AI 私有动作/草稿协调，核心业务和回执不依赖此表。
CREATE TABLE ai_note_action_states (
  owner_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  state_hash TEXT NOT NULL
);
