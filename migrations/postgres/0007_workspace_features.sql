CREATE TABLE IF NOT EXISTS project_member (
  "projectId" text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  "invitedBy" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("projectId", "userId")
);

CREATE TABLE IF NOT EXISTS project_asset (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  "uploadedBy" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  "mimeType" text NOT NULL,
  size integer NOT NULL CHECK (size >= 0 AND size <= 5242880),
  content bytea NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_event (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  "userId" text REFERENCES "user"(id) ON DELETE SET NULL,
  name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_audit_log (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  "actorId" text REFERENCES "user"(id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_member_user_idx ON project_member("userId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS project_asset_project_idx ON project_asset("projectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS analytics_event_project_created_idx ON analytics_event("projectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS analytics_event_project_name_idx ON analytics_event("projectId", name, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS project_audit_log_project_idx ON project_audit_log("projectId", "createdAt" DESC);
