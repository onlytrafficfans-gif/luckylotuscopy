CREATE TABLE IF NOT EXISTS project_checkpoint (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  label text NOT NULL,
  files jsonb NOT NULL,
  runtime jsonb NOT NULL,
  specification jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_checkpoint_project_created_at_idx
  ON project_checkpoint ("projectId", "createdAt" DESC);
