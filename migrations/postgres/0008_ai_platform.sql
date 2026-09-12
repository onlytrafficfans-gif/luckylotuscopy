CREATE TABLE IF NOT EXISTS user_ai_profile (
  "userId" text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  "onboardingCompleted" boolean NOT NULL DEFAULT false,
  "defaultMode" text NOT NULL DEFAULT 'auto' CHECK ("defaultMode" IN ('auto','build','fast','economy','free')),
  "costPreference" text NOT NULL DEFAULT 'balanced' CHECK ("costPreference" IN ('quality_first','balanced','save_tokens')),
  "maxEscalationLevel" integer NOT NULL DEFAULT 5 CHECK ("maxEscalationLevel" BETWEEN 1 AND 5),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Accounts that existed before this launch keep their current workspace flow.
INSERT INTO user_ai_profile ("userId", "onboardingCompleted")
SELECT id, true FROM "user"
ON CONFLICT ("userId") DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_provider_credential (
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('anthropic','openrouter')),
  "encryptedKey" text NOT NULL,
  "keyHint" text NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','invalid','error')),
  "lastCheckedAt" timestamptz,
  "lastSuccessAt" timestamptz,
  "errorCode" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", provider)
);

CREATE TABLE IF NOT EXISTS ai_provider_attempt (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('anthropic','openrouter')),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_provider_attempt_user_created_idx ON ai_provider_attempt ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS ai_usage_event (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "projectId" text REFERENCES project(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('anthropic','openrouter')),
  model text NOT NULL,
  "modelAlias" text NOT NULL,
  "inputTokens" bigint NOT NULL DEFAULT 0 CHECK ("inputTokens" >= 0),
  "outputTokens" bigint NOT NULL DEFAULT 0 CHECK ("outputTokens" >= 0),
  "reasoningTokens" bigint NOT NULL DEFAULT 0 CHECK ("reasoningTokens" >= 0),
  "cachedTokens" bigint NOT NULL DEFAULT 0 CHECK ("cachedTokens" >= 0),
  cost numeric(16,8),
  "requestType" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON ai_usage_event ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS ai_usage_project_created_idx ON ai_usage_event ("projectId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS ai_routing_outcome (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "projectId" text REFERENCES project(id) ON DELETE SET NULL,
  "requestType" text NOT NULL,
  "selectedAlias" text NOT NULL,
  "complexityLevel" integer NOT NULL CHECK ("complexityLevel" BETWEEN 1 AND 5),
  succeeded boolean NOT NULL,
  "validationSucceeded" boolean NOT NULL,
  escalated boolean NOT NULL DEFAULT false,
  "finalAlias" text,
  "latencyMs" integer NOT NULL CHECK ("latencyMs" >= 0),
  "totalTokens" bigint NOT NULL DEFAULT 0 CHECK ("totalTokens" >= 0),
  cost numeric(16,8),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_routing_user_created_idx ON ai_routing_outcome ("userId", "createdAt" DESC);
