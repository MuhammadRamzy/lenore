-- Business reports kept as records. A reference is reserved before the PDF
-- is drawn (so it can be printed on every page), then the PDF is stored.
-- Rows are never edited: generating the same period again adds a version.
CREATE TABLE report_archive (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('month', 'quarter', 'year', 'custom')),
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  pdf_key TEXT,
  bytes INTEGER,
  generated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  saved_at TEXT
);
CREATE INDEX report_archive_period ON report_archive(period_from, period_to);
