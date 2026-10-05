-- A failed controlled import is a startup barrier, not an empty usable database.
CREATE TABLE data_imports (
  source_hash TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('importing', 'validated', 'failed')),
  report_json TEXT,
  updated_at BIGINT NOT NULL
);
