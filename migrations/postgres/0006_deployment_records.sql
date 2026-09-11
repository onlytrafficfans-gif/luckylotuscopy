CREATE TABLE IF NOT EXISTS deployment_record (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "projectId" text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('vercel')),
  target text NOT NULL DEFAULT 'preview' CHECK (target IN ('preview', 'production')),
  status text NOT NULL CHECK (status IN ('queued', 'building', 'ready', 'error', 'canceled')),
  "providerDeploymentId" text NOT NULL,
  "providerProjectId" text NOT NULL,
  name text NOT NULL,
  url text,
  error text,
  "promotedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", provider, "providerDeploymentId")
);

CREATE INDEX IF NOT EXISTS deployment_record_project_created_at_idx
  ON deployment_record ("userId", "projectId", "createdAt" DESC);
