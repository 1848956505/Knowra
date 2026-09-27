CREATE TABLE ai_budget_days (
  account_ref TEXT NOT NULL,
  beijing_day TEXT NOT NULL,
  spent_microunits BIGINT NOT NULL DEFAULT 0 CHECK (spent_microunits >= 0),
  held_microunits BIGINT NOT NULL DEFAULT 0 CHECK (held_microunits >= 0),
  PRIMARY KEY (account_ref, beijing_day)
);

CREATE TABLE ai_budget_reservations (
  reservation_id TEXT PRIMARY KEY,
  account_ref TEXT NOT NULL,
  beijing_day TEXT NOT NULL,
  job_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  price_version TEXT NOT NULL,
  reserved_microunits BIGINT NOT NULL CHECK (reserved_microunits BETWEEN 1 AND 2000000),
  actual_microunits BIGINT CHECK (actual_microunits >= 0),
  status TEXT NOT NULL CHECK (status IN ('held','settled','unknown','released')),
  created_at TEXT NOT NULL,
  settled_at TEXT,
  FOREIGN KEY (account_ref, beijing_day) REFERENCES ai_budget_days(account_ref, beijing_day),
  UNIQUE (account_ref, attempt_id)
);
CREATE INDEX ai_budget_reservations_job ON ai_budget_reservations(account_ref, job_id);
