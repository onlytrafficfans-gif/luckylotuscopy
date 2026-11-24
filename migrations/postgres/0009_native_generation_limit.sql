CREATE TABLE IF NOT EXISTS ai_native_generation_limit (
  "userId" text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  "minuteStartedAt" timestamptz NOT NULL DEFAULT now(),
  "minuteCount" integer NOT NULL DEFAULT 0 CHECK ("minuteCount" >= 0),
  "dayStartedAt" date NOT NULL DEFAULT current_date,
  "dayCount" integer NOT NULL DEFAULT 0 CHECK ("dayCount" >= 0)
);

