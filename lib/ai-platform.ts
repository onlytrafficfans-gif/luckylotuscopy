import { z } from "zod";

export type LotusProvider = "anthropic" | "openrouter";
export type LotusModelAlias =
  | "lotus.flagship"
  | "lotus.performance"
  | "lotus.fast"
  | "lotus.economy"
  | "lotus.free";
export type LotusMode = "auto" | "build" | "fast" | "economy" | "free";
export type CostPreference = "quality_first" | "balanced" | "save_tokens";

export interface LotusModel {
  alias: LotusModelAlias;
  id: string;
  fallbackIds?: readonly string[];
  provider: LotusProvider;
  displayName: string;
  tier: "flagship" | "performance" | "fast" | "economy" | "free";
  inputPrice: number | null;
  outputPrice: number | null;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  codingScore: number;
  speedScore: number;
  costScore: number;
  agentScore: number;
  enabled: boolean;
  fallbackPriority: number;
}

// External ids live here only and may be replaced by environment config without
// changing application logic. Prices are intentionally null until refreshed
// from a trusted provider source; Lotus never invents spend.
export const LOTUS_MODELS: readonly LotusModel[] = [
  {
    alias: "lotus.flagship",
    id: process.env.LOTUS_FLAGSHIP_MODEL ?? "claude-fable-5-1",
    fallbackIds: ["claude-fable-5"],
    provider: "anthropic",
    displayName: "Fable 5.1",
    tier: "flagship",
    inputPrice: 10,
    outputPrice: 50,
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    codingScore: 100,
    speedScore: 55,
    costScore: 25,
    agentScore: 100,
    enabled: true,
    fallbackPriority: 50,
  },
  {
    alias: "lotus.performance",
    id: process.env.LOTUS_PERFORMANCE_MODEL ?? "xiaomi/mimo-v2.5",
    provider: "openrouter",
    displayName: "MiMo V2.5",
    tier: "performance",
    inputPrice: 0.112,
    outputPrice: 0.224,
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    codingScore: 88,
    speedScore: 78,
    costScore: 72,
    agentScore: 87,
    enabled: true,
    fallbackPriority: 40,
  },
  {
    alias: "lotus.fast",
    id: process.env.LOTUS_FAST_MODEL ?? "z-ai/glm-5.3-flash",
    provider: "openrouter",
    displayName: "GLM 5.3 Flash",
    tier: "fast",
    inputPrice: 0.15,
    outputPrice: 0.5,
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    codingScore: 80,
    speedScore: 94,
    costScore: 85,
    agentScore: 77,
    enabled: true,
    fallbackPriority: 30,
  },
  {
    alias: "lotus.economy",
    id: process.env.LOTUS_ECONOMY_MODEL ?? "deepseek/deepseek-v4-flash-0731",
    provider: "openrouter",
    displayName: "DeepSeek V4 Flash",
    tier: "economy",
    inputPrice: 0.05,
    outputPrice: 0.16,
    contextWindow: 1_300_000,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    codingScore: 73,
    speedScore: 90,
    costScore: 94,
    agentScore: 68,
    enabled: true,
    fallbackPriority: 20,
  },
  {
    alias: "lotus.free",
    id:
      process.env.LOTUS_FREE_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free",
    provider: "openrouter",
    displayName: "Free",
    tier: "free",
    inputPrice: 0,
    outputPrice: 0,
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
    codingScore: 65,
    speedScore: 68,
    costScore: 100,
    agentScore: 62,
    enabled: true,
    fallbackPriority: 10,
  },
] as const;

export const lotusModeSchema = z.enum([
  "auto",
  "build",
  "fast",
  "economy",
  "free",
]);
export const costPreferenceSchema = z.enum([
  "quality_first",
  "balanced",
  "save_tokens",
]);

const modelByAlias = new Map(LOTUS_MODELS.map((model) => [model.alias, model]));
export function getLotusModel(alias: LotusModelAlias) {
  const model = modelByAlias.get(alias);
  if (!model) throw new Error("The selected Lotus model is unavailable.");
  return model;
}

export interface TaskClassification {
  level: 1 | 2 | 3 | 4 | 5;
  reasons: string[];
  risk: "low" | "normal" | "high" | "critical";
}

export function classifyTask(input: {
  prompt: string;
  contextCharacters?: number;
  previousFailures?: number;
  likelyFiles?: number;
  toolsRequired?: boolean;
}): TaskClassification {
  const text = input.prompt.toLowerCase();
  let score = 1;
  const reasons: string[] = [];
  const add = (amount: number, reason: string) => {
    score += amount;
    reasons.push(reason);
  };
  const broad =
    /entire|full application|whole app|across the repository|multi-file|architecture|redesign/.test(
      text,
    );
  if (broad) add(3, "broad implementation scope");
  else if (
    /feature|component|api|integration|dashboard|implement|debug|fix/.test(text)
  )
    add(
      /feature.*(?:api|integration)|(?:api|integration).*feature/.test(text)
        ? 2
        : 1,
      "implementation work",
    );
  if (
    !broad &&
    /authentication|database|migration|production|security|permission|destructive/.test(
      text,
    )
  )
    add(1, "high-risk system boundary");
  if (
    /again|already tried|previous attempt|earlier attempts|three times|keeps failing/.test(
      text,
    ) ||
    (input.previousFailures ?? 0) > 1
  )
    add(2, "previous attempts failed");
  if (/authentication/.test(text) && /database|migration/.test(text))
    score = Math.max(score, 4);
  if ((input.likelyFiles ?? 0) >= 8) add(2, "many files likely affected");
  else if ((input.likelyFiles ?? 0) >= 3)
    add(1, "multiple files likely affected");
  if ((input.contextCharacters ?? 0) > 500_000) add(1, "large project context");
  if (input.toolsRequired) add(1, "tool execution required");
  if (
    /change (this )?(button text|background|border radius)|rename this|placeholder copy|explain this function/.test(
      text,
    )
  )
    score = 1;
  const level = Math.max(1, Math.min(5, score)) as TaskClassification["level"];
  return {
    level,
    reasons,
    risk:
      level === 5
        ? "critical"
        : level === 4
          ? "high"
          : level >= 2
            ? "normal"
            : "low",
  };
}

const LEVEL_ALIAS: Record<TaskClassification["level"], LotusModelAlias> = {
  1: "lotus.economy",
  2: "lotus.fast",
  3: "lotus.performance",
  4: "lotus.flagship",
  5: "lotus.flagship",
};
const MODE_ALIAS: Record<LotusMode, LotusModelAlias> = {
  auto: "lotus.performance",
  build: "lotus.flagship",
  fast: "lotus.performance",
  economy: "lotus.economy",
  free: "lotus.free",
};

export function createRoutingPlan(input: {
  prompt: string;
  mode: LotusMode;
  costPreference: CostPreference;
  providers: Record<LotusProvider, boolean>;
  maxEscalationLevel?: number;
  contextCharacters?: number;
  previousFailures?: number;
  likelyFiles?: number;
  toolsRequired?: boolean;
}) {
  const classification = classifyTask(input);
  let alias =
    input.mode === "auto"
      ? LEVEL_ALIAS[classification.level]
      : MODE_ALIAS[input.mode];
  if (input.mode === "fast" && classification.level <= 2) alias = "lotus.fast";
  if (
    input.mode === "auto" &&
    input.costPreference === "quality_first" &&
    classification.level === 3
  )
    alias = "lotus.flagship";
  if (
    input.mode === "auto" &&
    input.costPreference === "save_tokens" &&
    classification.level === 2
  )
    alias = "lotus.economy";
  // Critical boundaries are never weakened by a cost preference.
  if (
    classification.level >= 4 &&
    /authentication|database|migration|destructive|security|architecture/.test(
      input.prompt.toLowerCase(),
    )
  )
    alias = "lotus.flagship";
  const desired = getLotusModel(alias);
  const requiresDowngradeConsent =
    !input.providers[desired.provider] && classification.level >= 4;
  const order: LotusModelAlias[] =
    alias === "lotus.free"
      ? [
          "lotus.free",
          "lotus.economy",
          "lotus.fast",
          "lotus.performance",
          "lotus.flagship",
        ]
      : alias === "lotus.economy"
        ? ["lotus.economy", "lotus.fast", "lotus.performance", "lotus.flagship"]
        : alias === "lotus.fast"
          ? ["lotus.fast", "lotus.performance", "lotus.flagship"]
          : alias === "lotus.performance"
            ? ["lotus.performance", "lotus.flagship"]
            : ["lotus.flagship", "lotus.performance"];
  const maxLevel = Math.max(
    classification.level,
    Math.min(5, input.maxEscalationLevel ?? 5),
  );
  const tierLevel: Record<LotusModel["tier"], number> = {
    free: 0,
    economy: 1,
    fast: 2,
    performance: 3,
    flagship: 5,
  };
  const attempts = order
    .map(getLotusModel)
    .filter((model) => input.providers[model.provider])
    .filter((model) => model.tier !== "free" || classification.level <= 2)
    .filter((model) => tierLevel[model.tier] <= maxLevel);
  const selected = attempts[0] ?? desired;
  return {
    classification,
    selected,
    attempts,
    requiresDowngradeConsent,
    estimatedSize: estimateTaskSize({
      prompt: input.prompt,
      contextCharacters: input.contextCharacters ?? 0,
    }),
  };
}

export function estimateTaskSize(input: {
  prompt: string;
  contextCharacters: number;
}) {
  const anticipatedTokens =
    Math.ceil((input.prompt.length + input.contextCharacters) / 3.5) + 4_000;
  const label =
    anticipatedTokens < 10_000
      ? "Small"
      : anticipatedTokens < 50_000
        ? "Medium"
        : anticipatedTokens < 200_000
          ? "Large"
          : "Very Large";
  return {
    anticipatedTokens,
    label: label as "Small" | "Medium" | "Large" | "Very Large",
  };
}

const asCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0;
export function normalizeUsage(value: Record<string, unknown>) {
  return {
    inputTokens: asCount(value.inputTokens ?? value.input_tokens),
    outputTokens: asCount(value.outputTokens ?? value.output_tokens),
    reasoningTokens: asCount(value.reasoningTokens ?? value.reasoning_tokens),
    cachedTokens: asCount(
      value.cachedInputTokens ?? value.cachedTokens ?? value.cache_tokens,
    ),
    cost:
      typeof value.cost === "number" &&
      Number.isFinite(value.cost) &&
      value.cost >= 0
        ? value.cost
        : null,
  };
}

export function sanitizeProviderError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  if (/401|403|unauthori|invalid.*key|authentication/i.test(raw))
    return "The provider rejected this API key.";
  if (/429|rate.?limit/i.test(raw))
    return "The provider is temporarily rate limited.";
  return "The AI provider could not complete the request.";
}
