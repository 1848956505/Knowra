-- AI-01-06: private answer and question for task recovery. These columns are not part of sync or ordinary exports.
ALTER TABLE ai_jobs ADD COLUMN question TEXT;
ALTER TABLE ai_jobs ADD COLUMN result_json TEXT;
