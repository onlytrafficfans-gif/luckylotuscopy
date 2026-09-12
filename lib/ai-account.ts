import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import {
  postgresPool,
  row,
  rows,
  type PostgresExecutor,
} from "@/lib/db/postgres";
import {
  costPreferenceSchema,
  lotusModeSchema,
  normalizeUsage,
  type LotusModel,
  type LotusProvider,
} from "@/lib/ai-platform";

const providerSchema = z.enum(["anthropic", "openrouter"]);
const keySchema = z.string().trim().min(16).max(512);
export const aiPreferencesSchema = z.object({
  defaultMode: lotusModeSchema,
  costPreference: costPreferenceSchema,
  maxEscalationLevel: z.number().int().min(1).max(5),
});

export interface ProviderStatus {
  provider: LotusProvider;
  connected: boolean;
  keyHint: string;
  status: "connected" | "invalid" | "error" | "disconnected";
  health: "healthy" | "degraded" | "unknown";
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
}
export interface AiProfile {
  onboardingCompleted: boolean;
  defaultMode: z.infer<typeof lotusModeSchema>;
  costPreference: z.infer<typeof costPreferenceSchema>;
  maxEscalationLevel: number;
}

function secretKey() {
  const secret =
    process.env.API_KEY_ENCRYPTION_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Server key encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}
function encryptKey(key: string, userId: string, provider: LotusProvider) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  cipher.setAAD(Buffer.from(`${userId}:${provider}`));
  const encrypted = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
function decryptKey(value: string, userId: string, provider: LotusProvider) {
  const payload = Buffer.from(value, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey(),
    payload.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(`${userId}:${provider}`));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([
    decipher.update(payload.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

export async function getAiProfile(
  userId: string,
  executor: PostgresExecutor = postgresPool,
): Promise<AiProfile> {
  await executor.query(
    'INSERT INTO user_ai_profile ("userId") VALUES ($1) ON CONFLICT ("userId") DO NOTHING',
    [userId],
  );
  return row<AiProfile>(
    executor,
    'SELECT "onboardingCompleted", "defaultMode", "costPreference", "maxEscalationLevel" FROM user_ai_profile WHERE "userId"=$1',
    [userId],
  );
}
export async function completeAiOnboarding(
  userId: string,
  executor: PostgresExecutor = postgresPool,
) {
  await executor.query(
    'INSERT INTO user_ai_profile ("userId", "onboardingCompleted") VALUES ($1,true) ON CONFLICT ("userId") DO UPDATE SET "onboardingCompleted"=true,"updatedAt"=now()',
    [userId],
  );
}
export async function updateAiPreferences(
  userId: string,
  input: unknown,
  executor: PostgresExecutor = postgresPool,
) {
  const value = aiPreferencesSchema.parse(input);
  await executor.query(
    'INSERT INTO user_ai_profile ("userId","defaultMode","costPreference","maxEscalationLevel") VALUES ($1,$2,$3,$4) ON CONFLICT ("userId") DO UPDATE SET "defaultMode"=$2,"costPreference"=$3,"maxEscalationLevel"=$4,"updatedAt"=now()',
    [userId, value.defaultMode, value.costPreference, value.maxEscalationLevel],
  );
  return getAiProfile(userId, executor);
}

async function claimAttempt(
  userId: string,
  provider: LotusProvider,
  executor: PostgresExecutor,
) {
  const count = await row<{ count: string }>(
    executor,
    'SELECT count(*)::text AS count FROM ai_provider_attempt WHERE "userId"=$1 AND "createdAt">now()-interval \'1 minute\'',
    [userId],
  );
  if (Number(count?.count ?? 0) >= 6)
    throw new Error(
      "Too many connection attempts. Wait a minute and try again.",
    );
  await executor.query(
    'INSERT INTO ai_provider_attempt (id,"userId",provider) VALUES ($1,$2,$3)',
    [crypto.randomUUID(), userId, provider],
  );
}

async function verifyKey(
  provider: LotusProvider,
  key: string,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(
      provider === "anthropic"
        ? "https://api.anthropic.com/v1/models?limit=1"
        : "https://openrouter.ai/api/v1/key",
      {
        headers:
          provider === "anthropic"
            ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
            : { Authorization: `Bearer ${key}` },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (response.status === 401 || response.status === 403)
      return {
        ok: false as const,
        status: "invalid" as const,
        error: "Invalid key",
      };
    if (!response.ok)
      return {
        ok: false as const,
        status: "error" as const,
        error: "Connection error",
      };
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      status: "error" as const,
      error: "Connection error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function saveProviderCredential(
  userId: string,
  input: unknown,
  executor: PostgresExecutor = postgresPool,
  fetcher: typeof fetch = fetch,
) {
  const parsed = z
    .object({ provider: providerSchema, apiKey: keySchema })
    .parse(input);
  await claimAttempt(userId, parsed.provider, executor);
  const check = await verifyKey(parsed.provider, parsed.apiKey, fetcher);
  if (!check.ok) return check;
  const encrypted = encryptKey(parsed.apiKey, userId, parsed.provider);
  const keyHint = `••••••••••${parsed.apiKey.slice(-4)}`;
  await executor.query(
    'INSERT INTO ai_provider_credential ("userId",provider,"encryptedKey","keyHint",status,"lastCheckedAt","lastSuccessAt") VALUES ($1,$2,$3,$4,\'connected\',now(),now()) ON CONFLICT ("userId",provider) DO UPDATE SET "encryptedKey"=$3,"keyHint"=$4,status=\'connected\',"lastCheckedAt"=now(),"lastSuccessAt"=now(),"errorCode"=NULL,"updatedAt"=now()',
    [userId, parsed.provider, encrypted, keyHint],
  );
  return {
    ok: true as const,
    status: await getProviderStatus(userId, parsed.provider, executor),
  };
}

export async function testProviderCredential(
  userId: string,
  providerInput: unknown,
  executor: PostgresExecutor = postgresPool,
  fetcher: typeof fetch = fetch,
) {
  const provider = providerSchema.parse(providerInput);
  await claimAttempt(userId, provider, executor);
  const stored = await row<{ encryptedKey: string }>(
    executor,
    'SELECT "encryptedKey" FROM ai_provider_credential WHERE "userId"=$1 AND provider=$2',
    [userId, provider],
  );
  if (!stored)
    return {
      ok: false as const,
      status: "invalid" as const,
      error: "Not connected",
    };
  let check: Awaited<ReturnType<typeof verifyKey>>;
  try {
    check = await verifyKey(
      provider,
      decryptKey(stored.encryptedKey, userId, provider),
      fetcher,
    );
  } catch {
    check = { ok: false, status: "error", error: "Connection error" };
  }
  await executor.query(
    'UPDATE ai_provider_credential SET status=$3,"lastCheckedAt"=now(),"lastSuccessAt"=CASE WHEN $3=\'connected\' THEN now() ELSE "lastSuccessAt" END,"errorCode"=$4,"updatedAt"=now() WHERE "userId"=$1 AND provider=$2',
    [
      userId,
      provider,
      check.ok ? "connected" : check.status,
      check.ok ? null : check.status,
    ],
  );
  return check.ok
    ? {
        ok: true as const,
        status: await getProviderStatus(userId, provider, executor),
      }
    : check;
}

export async function removeProviderCredential(
  userId: string,
  providerInput: unknown,
  executor: PostgresExecutor = postgresPool,
) {
  const provider = providerSchema.parse(providerInput);
  await executor.query(
    'DELETE FROM ai_provider_credential WHERE "userId"=$1 AND provider=$2',
    [userId, provider],
  );
}
export async function getProviderStatus(
  userId: string,
  provider: LotusProvider,
  executor: PostgresExecutor = postgresPool,
): Promise<ProviderStatus> {
  const item = await row<{
    keyHint: string;
    status: "connected" | "invalid" | "error";
    lastCheckedAt: Date | null;
    lastSuccessAt: Date | null;
    errorCode: string | null;
  }>(
    executor,
    'SELECT "keyHint",status,"lastCheckedAt","lastSuccessAt","errorCode" FROM ai_provider_credential WHERE "userId"=$1 AND provider=$2',
    [userId, provider],
  );
  return item
    ? {
        provider,
        connected: item.status === "connected",
        keyHint: item.keyHint,
        status: item.status,
        health: item.errorCode ? "degraded" : item.lastCheckedAt ? "healthy" : "unknown",
        lastCheckedAt: item.lastCheckedAt?.toISOString() ?? null,
        lastSuccessAt: item.lastSuccessAt?.toISOString() ?? null,
      }
    : {
        provider,
        connected: false,
        keyHint: "",
        status: "disconnected",
        health: "unknown",
        lastCheckedAt: null,
        lastSuccessAt: null,
      };
}
export async function listProviderStatuses(
  userId: string,
  executor: PostgresExecutor = postgresPool,
) {
  return Promise.all(
    (["anthropic", "openrouter"] as const).map((provider) =>
      getProviderStatus(userId, provider, executor),
    ),
  );
}
export async function getProviderKey(
  userId: string,
  provider: LotusProvider,
  executor: PostgresExecutor = postgresPool,
) {
  const stored = await row<{ encryptedKey: string }>(
    executor,
    'SELECT "encryptedKey" FROM ai_provider_credential WHERE "userId"=$1 AND provider=$2 AND status=\'connected\'',
    [userId, provider],
  );
  if (!stored) return null;
  try {
    return decryptKey(stored.encryptedKey, userId, provider);
  } catch {
    return null;
  }
}

export async function recordProviderHealth(userId:string,provider:LotusProvider,healthy:boolean,errorCode:string|null=null,executor:PostgresExecutor=postgresPool){await executor.query('UPDATE ai_provider_credential SET "lastCheckedAt"=now(),"lastSuccessAt"=CASE WHEN $3 THEN now() ELSE "lastSuccessAt" END,"errorCode"=$4,"updatedAt"=now() WHERE "userId"=$1 AND provider=$2',[userId,provider,healthy,errorCode])}

export async function getOpenRouterCredit(
  userId: string,
  executor: PostgresExecutor = postgresPool,
  fetcher: typeof fetch = fetch,
) {
  const key = await getProviderKey(userId, "openrouter", executor);
  if (!key) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: { total_credits?: number; total_usage?: number };
    };
    const total = body.data?.total_credits,
      used = body.data?.total_usage;
    return typeof total === "number" && typeof used === "number"
      ? Math.max(0, total - used)
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function recordAiUsage(
  input: {
    userId: string;
    projectId: string | null;
    model: LotusModel;
    usage: Record<string, unknown>;
    requestType: string;
  },
  executor: PostgresExecutor = postgresPool,
) {
  const usage = normalizeUsage(input.usage);
  await executor.query(
    'INSERT INTO ai_usage_event (id,"userId","projectId",provider,model,"modelAlias","inputTokens","outputTokens","reasoningTokens","cachedTokens",cost,"requestType") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [
      crypto.randomUUID(),
      input.userId,
      input.projectId,
      input.model.provider,
      input.model.id,
      input.model.alias,
      usage.inputTokens,
      usage.outputTokens,
      usage.reasoningTokens,
      usage.cachedTokens,
      usage.cost,
      input.requestType,
    ],
  );
  return usage;
}
export async function recordRoutingOutcome(
  input: {
    userId: string;
    projectId: string | null;
    requestType: string;
    selectedAlias: string;
    complexityLevel: number;
    succeeded: boolean;
    validationSucceeded: boolean;
    escalated: boolean;
    finalAlias: string | null;
    latencyMs: number;
    totalTokens: number;
    cost: number | null;
  },
  executor: PostgresExecutor = postgresPool,
) {
  await executor.query(
    'INSERT INTO ai_routing_outcome (id,"userId","projectId","requestType","selectedAlias","complexityLevel",succeeded,"validationSucceeded",escalated,"finalAlias","latencyMs","totalTokens",cost) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [
      crypto.randomUUID(),
      input.userId,
      input.projectId,
      input.requestType,
      input.selectedAlias,
      input.complexityLevel,
      input.succeeded,
      input.validationSucceeded,
      input.escalated,
      input.finalAlias,
      input.latencyMs,
      input.totalTokens,
      input.cost,
    ],
  );
}

export async function getAiUsageSummary(
  userId: string,
  executor: PostgresExecutor = postgresPool,
) {
  const totals = await row<{
    today: string;
    week: string;
    month: string;
    cost: string | null;
  }>(
    executor,
    `SELECT coalesce(sum("inputTokens"+"outputTokens"+"reasoningTokens"+"cachedTokens") FILTER (WHERE "createdAt">=date_trunc('day',now())),0)::text today,coalesce(sum("inputTokens"+"outputTokens"+"reasoningTokens"+"cachedTokens") FILTER (WHERE "createdAt">=now()-interval '7 days'),0)::text week,coalesce(sum("inputTokens"+"outputTokens"+"reasoningTokens"+"cachedTokens") FILTER (WHERE "createdAt">=date_trunc('month',now())),0)::text month,sum(cost) FILTER (WHERE "createdAt">=date_trunc('month',now()))::text cost FROM ai_usage_event WHERE "userId"=$1`,
    [userId],
  );
  const byModels = await rows<{ modelAlias: string; tokens: string }>(
    executor,
    `SELECT "modelAlias",sum("inputTokens"+"outputTokens"+"reasoningTokens"+"cachedTokens")::text tokens FROM ai_usage_event WHERE "userId"=$1 AND "createdAt">=date_trunc('month',now()) GROUP BY "modelAlias" ORDER BY sum("inputTokens"+"outputTokens"+"reasoningTokens"+"cachedTokens") DESC`,
    [userId],
  );
  const byProviders = await rows<{ provider: LotusProvider; tokens: string }>(
    executor,
    `SELECT provider,sum("inputTokens"+"outputTokens"+"reasoningTokens"+"cachedTokens")::text tokens FROM ai_usage_event WHERE "userId"=$1 AND "createdAt">=date_trunc('month',now()) GROUP BY provider`,
    [userId],
  );
  return {
    today: Number(totals?.today ?? 0),
    week: Number(totals?.week ?? 0),
    month: Number(totals?.month ?? 0),
    estimatedSpend:
      totals?.cost === null || totals?.cost === undefined
        ? null
        : Number(totals.cost),
    byModels: byModels.map((x) => ({ ...x, tokens: Number(x.tokens) })),
    byProviders: byProviders.map((x) => ({ ...x, tokens: Number(x.tokens) })),
  };
}
