// The database schema as a string, so it is bundled like any other module and
// never read from disk at runtime (a file read breaks inside Next server bundles).
// Safe to run on every start: every statement is idempotent.
// Tables without row-level security: sign-in identity and rate limits. The app
// reaches them through rolewright_system, and rolewright_app (the role every
// user-data query runs as) holds no privilege on them. Every other table in
// public must have forced row-level security, a policy and a user_id column
// (tests/db-structure.test.mjs).
export const SYSTEM_TABLES = Object.freeze(["users", "accounts", "verification_tokens", "rate_events"]);

export const SCHEMA_SQL = `-- Rolewright schema. Safe to run on every start: every statement is idempotent.
--
-- Isolation model: user-data tables have row-level security, and the app only
-- touches them after \`SET LOCAL ROLE rolewright_app\` (see withUser in index.mjs).
-- A superuser or table owner would bypass the policies, which is exactly why
-- the role switch is not optional.

-- The role the app drops to for every user-data query. NOLOGIN: nobody connects as it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rolewright_app') THEN
    CREATE ROLE rolewright_app NOLOGIN;
  END IF;
END
$$;

-- Lets the connecting database user switch into that role. Needed on managed
-- Postgres where the app user is not a superuser. Ignored when it is already a
-- member or already a superuser.
DO $$
BEGIN
  EXECUTE format('GRANT rolewright_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

-- Identity tables: no row-level security, and rolewright_app gets no access.
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  image text,
  email_verified timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier text NOT NULL,
  token text NOT NULL,
  expires timestamptz NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- User-data tables.
CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  filename text,
  raw_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fact_bases (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  facts jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text,
  company text,
  jd_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tailorings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  suggestions jsonb NOT NULL,
  provider text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Who agreed to which notice version, for what, and when (ADR 0004). Append-only
-- for the app: it can read and add rows, never change or delete them.
CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  notice_version text NOT NULL,
  purpose text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notice_version, purpose)
);

CREATE INDEX IF NOT EXISTS resumes_user_id_idx ON resumes (user_id);
CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs (user_id);
CREATE INDEX IF NOT EXISTS tailorings_user_id_idx ON tailorings (user_id);
CREATE INDEX IF NOT EXISTS tailorings_job_id_idx ON tailorings (job_id);

-- Row-level security. FORCE makes the policies apply to the table owner too.
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes FORCE ROW LEVEL SECURITY;
ALTER TABLE fact_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE fact_bases FORCE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE tailorings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailorings FORCE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resumes_isolation ON resumes;
CREATE POLICY resumes_isolation ON resumes
  USING (user_id = current_setting('app.user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.user_id')::uuid);

DROP POLICY IF EXISTS fact_bases_isolation ON fact_bases;
CREATE POLICY fact_bases_isolation ON fact_bases
  USING (user_id = current_setting('app.user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.user_id')::uuid);

DROP POLICY IF EXISTS jobs_isolation ON jobs;
CREATE POLICY jobs_isolation ON jobs
  USING (user_id = current_setting('app.user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.user_id')::uuid);

DROP POLICY IF EXISTS tailorings_isolation ON tailorings;
CREATE POLICY tailorings_isolation ON tailorings
  USING (user_id = current_setting('app.user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.user_id')::uuid);

DROP POLICY IF EXISTS consents_isolation ON consents;
CREATE POLICY consents_isolation ON consents
  USING (user_id = current_setting('app.user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.user_id')::uuid);

-- Privileges: user-data tables only. Nothing on users, accounts or verification_tokens.
GRANT SELECT, INSERT, UPDATE, DELETE ON resumes, fact_bases, jobs, tailorings TO rolewright_app;
GRANT SELECT, INSERT ON consents TO rolewright_app;

-- P1-16
ALTER TABLE tailorings ADD COLUMN IF NOT EXISTS lines_total integer;
ALTER TABLE tailorings ADD COLUMN IF NOT EXISTS lines_sent integer;
ALTER TABLE tailorings ADD COLUMN IF NOT EXISTS rewrites_returned integer;

-- P1-15
ALTER TABLE consents ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT '';
ALTER TABLE consents DROP CONSTRAINT IF EXISTS consents_user_id_notice_version_purpose_key;
CREATE UNIQUE INDEX IF NOT EXISTS consents_user_version_purpose_provider_key
  ON consents (user_id, notice_version, purpose, provider);

-- P1-3
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rolewright_system') THEN
    CREATE ROLE rolewright_system NOLOGIN;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS rate_events (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  subject text NOT NULL,
  cost integer NOT NULL DEFAULT 1,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_events_lookup_idx ON rate_events (bucket, subject, at);
GRANT SELECT, INSERT, DELETE ON rate_events TO rolewright_system;
GRANT USAGE, SELECT ON SEQUENCE rate_events_id_seq TO rolewright_system;

-- P1-17
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rolewright_system') THEN
    CREATE ROLE rolewright_system NOLOGIN;
  END IF;
END $$;
DO $$ BEGIN
  EXECUTE format('GRANT rolewright_system TO %I', current_user);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, accounts, verification_tokens TO rolewright_system;

-- P1-2
CREATE TABLE IF NOT EXISTS trial_counters (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  tailorings_used integer NOT NULL DEFAULT 0 CHECK (tailorings_used BETWEEN 0 AND 5),
  uploads_used integer NOT NULL DEFAULT 0 CHECK (uploads_used BETWEEN 0 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE trial_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trial_counters_isolation ON trial_counters;
CREATE POLICY trial_counters_isolation ON trial_counters
  USING (user_id = current_setting('app.user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.user_id')::uuid);
GRANT SELECT, INSERT, UPDATE ON trial_counters TO rolewright_app;

-- P2-1
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name IN ('resume_uploaded','tailoring_created','export_succeeded','export_blocked')),
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_user_id_idx ON events (user_id);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_isolation ON events;
CREATE POLICY events_isolation ON events TO rolewright_app
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS events_report ON events;
CREATE POLICY events_report ON events FOR SELECT TO rolewright_system USING (true);
GRANT SELECT, INSERT ON events TO rolewright_app;
GRANT SELECT ON events TO rolewright_system;
`;
