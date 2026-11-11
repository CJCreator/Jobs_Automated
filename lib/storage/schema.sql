-- career-ops: Local-First Embedded SQLite Schema
-- High-speed query engine caching applications, transitions, and reports with WAL mode.

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- Applications Table: Mirrors data/applications.md rows.
-- row_id is the surrogate primary key. `id` holds the tracker # for lookups only:
-- it is not unique (duplicate or renumbered rows must not break the sync).
CREATE TABLE IF NOT EXISTS applications (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER NOT NULL,
  date_applied TEXT,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  score_raw TEXT,
  score_numeric REAL,
  pdf TEXT,
  report TEXT,
  report_num INTEGER,
  notes TEXT,
  url TEXT,
  location TEXT,
  via TEXT,
  raw_line TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_id ON applications(id);
CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_score ON applications(score_numeric);
CREATE INDEX IF NOT EXISTS idx_applications_date ON applications(date_applied);
CREATE INDEX IF NOT EXISTS idx_applications_report_num ON applications(report_num);

-- Status Transitions Ledger: Mirrors data/status-log.tsv
CREATE TABLE IF NOT EXISTS status_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracker_num INTEGER NOT NULL,
  event_date TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transitions_tracker_num ON status_transitions(tracker_num);
CREATE INDEX IF NOT EXISTS idx_transitions_event_date ON status_transitions(event_date);

-- Evaluated Reports: Cache of parsed reports from reports/*.md
CREATE TABLE IF NOT EXISTS reports (
  report_num INTEGER PRIMARY KEY,
  company TEXT,
  role TEXT,
  score REAL,
  legitimacy TEXT,
  path TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_score ON reports(score);

-- Sync Metadata: Tracks file checksums and mtimes for zero-overhead validation
CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  last_synced_at TEXT NOT NULL
);

