CREATE TABLE IF NOT EXISTS lite_projects (
  publication_id TEXT PRIMARY KEY,
  local_project_id TEXT NOT NULL UNIQUE,
  share_token TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  snapshot_json JSONB NOT NULL,
  remote_version INTEGER NOT NULL DEFAULT 1,
  annotation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  download_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  access_mode TEXT NOT NULL DEFAULT 'open' CHECK (access_mode IN ('open', 'passcode', 'member_email')),
  access_code_hash TEXT,
  annotation_revision BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lite_projects_share_token
  ON lite_projects(share_token);

CREATE TABLE IF NOT EXISTS lite_files (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES lite_projects(publication_id) ON DELETE CASCADE,
  source_file_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  blob_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(publication_id, source_file_id)
);

CREATE INDEX IF NOT EXISTS idx_lite_files_publication
  ON lite_files(publication_id);

CREATE TABLE IF NOT EXISTS lite_members (
  publication_id TEXT NOT NULL REFERENCES lite_projects(publication_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('internal', 'external')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(publication_id, email)
);

CREATE INDEX IF NOT EXISTS idx_lite_members_email
  ON lite_members(email);

CREATE TABLE IF NOT EXISTS lite_access_attempts (
  publication_id TEXT NOT NULL REFERENCES lite_projects(publication_id) ON DELETE CASCADE,
  attempt_key TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  PRIMARY KEY(publication_id, attempt_key)
);

CREATE TABLE IF NOT EXISTS lite_annotations (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES lite_projects(publication_id) ON DELETE CASCADE,
  file_id TEXT REFERENCES lite_files(id) ON DELETE CASCADE,
  field_key TEXT,
  page_number INTEGER,
  parent_id TEXT REFERENCES lite_annotations(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  revision BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lite_annotations_publication_revision
  ON lite_annotations(publication_id, revision);
