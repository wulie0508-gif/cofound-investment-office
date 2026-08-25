ALTER TABLE lite_projects
  ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'open';

ALTER TABLE lite_projects
  ADD COLUMN IF NOT EXISTS access_code_hash TEXT;

UPDATE lite_projects AS project
SET access_mode = 'member_email'
WHERE project.access_mode = 'open'
  AND project.access_code_hash IS NULL
  AND EXISTS (
    SELECT 1 FROM lite_members AS member
    WHERE member.publication_id = project.publication_id
  );

CREATE TABLE IF NOT EXISTS lite_access_attempts (
  publication_id TEXT NOT NULL REFERENCES lite_projects(publication_id) ON DELETE CASCADE,
  attempt_key TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  PRIMARY KEY(publication_id, attempt_key)
);
