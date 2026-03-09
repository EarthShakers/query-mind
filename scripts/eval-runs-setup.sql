CREATE TABLE IF NOT EXISTS eval_runs (
  id              BIGSERIAL PRIMARY KEY,
  run_mode        TEXT NOT NULL DEFAULT 'e2e',
  faithfulness    DOUBLE PRECISION NOT NULL DEFAULT 0,
  answer_relevancy DOUBLE PRECISION NOT NULL DEFAULT 0,
  context_precision DOUBLE PRECISION NOT NULL DEFAULT 0,
  context_recall  DOUBLE PRECISION NOT NULL DEFAULT 0,
  sample_count    INTEGER NOT NULL DEFAULT 0,
  dataset_path    TEXT,
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS eval_runs_created_at_idx ON eval_runs (created_at DESC);
 