import { NextResponse } from 'next/server'
import { getAiProfile, getProviderKey, recordAiUsage, recordRoutingOutcome } from '@/lib/ai-account'
import { createRoutingPlan, normalizeUsage, sanitizeProviderError, type LotusProvider } from '@/lib/ai-platform'
import { requireCurrentUser } from '@/lib/auth-session'
import { postgresPool } from '@/lib/db/postgres'
import { generationJsonSchema, validateGenerationResult, validateSpecification } from '@/lib/native-generation'

export const runtime = 'nodejs'
export const maxDuration = 60

const maxPromptLength = 2_000
const allowedOrigins = new Set([
  'https://www.luckylotus.app',
  'https://luckylotus.app',
  'https://lotus-app-builder.vercel.app',
  'lotusappbuilder://',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:19006',
  'http://127.0.0.1:19006',
])

const corsHeaders = (origin: string | null) => {
  if (origin && !allowedOrigins.has(origin)) return null
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    ...(origin ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie, Expo-Origin',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

const jsonError = (status: number, error: string, code: string, headers: Record<string, string>) =>
  NextResponse.json({ error, code }, { status, headers })

async function claimGenerationSlot(userId: string) {
  const result = await postgresPool.query<{
    minuteCount: number
    dayCount: number
  }>(
    `INSERT INTO ai_native_generation_limit ("userId","minuteStartedAt","minuteCount","dayStartedAt","dayCount")
     VALUES ($1,now(),1,current_date,1)
     ON CONFLICT ("userId") DO UPDATE SET
       "minuteCount" = CASE
         WHEN ai_native_generation_limit."minuteStartedAt" <= now() - interval '1 minute' THEN 1
         ELSE ai_native_generation_limit."minuteCount" + 1
       END,
       "minuteStartedAt" = CASE
         WHEN ai_native_generation_limit."minuteStartedAt" <= now() - interval '1 minute' THEN now()
         ELSE ai_native_generation_limit."minuteStartedAt"
       END,
       "dayCount" = CASE
         WHEN ai_native_generation_limit."dayStartedAt" < current_date THEN 1
         ELSE ai_native_generation_limit."dayCount" + 1
       END,
       "dayStartedAt" = CASE
         WHEN ai_native_generation_limit."dayStartedAt" < current_date THEN current_date
         ELSE ai_native_generation_limit."dayStartedAt"
       END
     RETURNING "minuteCount","dayCount"`,
    [userId],
  )
  return result.rows[0]
}

const systemPrompt = `You are the native app design engine for Lotus App Builder.
Return a complete, polished, production-minded app specification that follows the supplied JSON schema.

Rules:
- Choose a distinct visual direction that fits the product and audience.
- Use 3-7 sections for focused edits and 5-9 sections for a new app when appropriate.
- Preserve unrelated sections during follow-up edits.
- Use only the supported section types. Return no source code, HTML, JSX, URLs, secrets, or package names.
- Keep copy concise, realistic, accessible, and useful on a phone screen.
- Return the complete updated specification, a concise summary, and changed section IDs.`

async function callOpenRouter(apiKey: string, model: string, prompt: string, currentSpecification: unknown, signal: AbortSignal) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.luckylotus.app',
      'X-OpenRouter-Title': 'Lotus App Builder',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ request: prompt, currentSpecification }) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'lotus_native_generation',
          strict: true,
          schema: generationJsonSchema,
        },
      },
      max_tokens: 8_000,
    }),
    signal,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Provider returned ${response.status}`)
  const body = await response.json() as {
    choices?: Array<{ message?: { content?: string | null; refusal?: string } }>
    usage?: Record<string, unknown>
  }
  const message = body.choices?.[0]?.message
  if (message?.refusal) throw new Error('The provider refused this request.')
  if (!message?.content) throw new Error('The provider returned no structured content.')
  const rawUsage = body.usage ?? {}
  const promptDetails = rawUsage.prompt_tokens_details as Record<string, unknown> | undefined
  const completionDetails = rawUsage.completion_tokens_details as Record<string, unknown> | undefined
  return {
    result: JSON.parse(message.content),
    usage: {
      ...rawUsage,
      inputTokens: rawUsage.prompt_tokens,
      outputTokens: rawUsage.completion_tokens,
      reasoningTokens: completionDetails?.reasoning_tokens,
      cachedTokens: promptDetails?.cached_tokens,
      cost: rawUsage.cost ?? rawUsage.total_cost,
    },
  }
}

async function callAnthropic(apiKey: string, model: string, prompt: string, currentSpecification: unknown, signal: AbortSignal) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8_000,
      system: systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify({ request: prompt, currentSpecification }) }],
      tools: [{
        name: 'return_lotus_native_generation',
        description: 'Return the complete validated Lotus app specification and change summary.',
        input_schema: generationJsonSchema,
      }],
      tool_choice: { type: 'tool', name: 'return_lotus_native_generation' },
    }),
    signal,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Provider returned ${response.status}`)
  const body = await response.json() as {
    content?: Array<{ type?: string; name?: string; input?: unknown }>
    usage?: Record<string, unknown>
  }
  const block = body.content?.find((item) => item.type === 'tool_use' && item.name === 'return_lotus_native_generation')
  if (!block?.input) throw new Error('The provider returned no structured content.')
  return { result: block.input, usage: body.usage ?? {} }
}

export async function OPTIONS(request: Request) {
  const headers = corsHeaders(request.headers.get('origin'))
  return headers
    ? new NextResponse(null, { status: 204, headers })
    : NextResponse.json({ error: 'Origin not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, { status: 403 })
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get('origin'))
  if (!headers) return NextResponse.json({ error: 'Origin not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, { status: 403 })
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 150_000) return jsonError(413, 'The request is too large.', 'REQUEST_TOO_LARGE', headers)

  let body: { prompt?: unknown; currentSpecification?: unknown; allowDowngrade?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'The request body must be valid JSON.', 'INVALID_JSON', headers)
  }

  if (typeof body.prompt !== 'string' || body.prompt.trim().length < 3 || body.prompt.length > maxPromptLength) {
    return jsonError(400, 'Enter a request between 3 and 2,000 characters.', 'INVALID_PROMPT', headers)
  }

  let currentSpecification
  try {
    currentSpecification = validateSpecification(body.currentSpecification)
  } catch {
    return jsonError(400, 'The current project could not be read. Reopen it and try again.', 'INVALID_PROJECT', headers)
  }

  try {
    const user = await requireCurrentUser()
    const limits = await claimGenerationSlot(user.id)
    if (!limits || limits.minuteCount > 8 || limits.dayCount > 100) {
      return jsonError(429, 'Generation limit reached. Wait a moment and try again.', 'RATE_LIMITED', headers)
    }

    const [profile, openrouterKey, anthropicKey] = await Promise.all([
      getAiProfile(user.id),
      getProviderKey(user.id, 'openrouter'),
      getProviderKey(user.id, 'anthropic'),
    ])
    const providerKeys: Record<LotusProvider, string | null> = {
      openrouter: openrouterKey,
      anthropic: anthropicKey,
    }
    const allowDowngrade = body.allowDowngrade === true
    const plan = createRoutingPlan({
      prompt: body.prompt.trim(),
      mode: profile.defaultMode,
      costPreference: profile.costPreference,
      maxEscalationLevel: profile.maxEscalationLevel,
      providers: {
        openrouter: Boolean(openrouterKey),
        anthropic: Boolean(anthropicKey),
      },
    })
    if (plan.requiresDowngradeConsent && !allowDowngrade) {
      return jsonError(409, 'The selected model is not connected. Continue with a lower-tier Lotus model?', 'DOWNGRADE_CONSENT_REQUIRED', headers)
    }
    const plannedCandidates = plan.attempts.slice(0, 2)
    const candidates = allowDowngrade && plan.selected.alias === 'lotus.flagship'
      ? plannedCandidates.filter((candidate) => candidate.alias !== 'lotus.flagship')
      : plannedCandidates
    if (!candidates.length) {
      return jsonError(409, 'Connect OpenRouter or Anthropic in your Lotus account before generating.', 'AI_PROVIDER_NOT_CONFIGURED', headers)
    }

    const startedAt = Date.now()
    const requestDeadline = startedAt + 55_000
    let generated: { result: unknown; usage: Record<string, unknown> } | undefined
    let model = candidates[0]
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      const key = providerKeys[candidate.provider]
      if (!key) continue
      const remainingMs = requestDeadline - Date.now()
      if (remainingMs <= 0) break
      const signal = AbortSignal.timeout(remainingMs)
      model = candidate
      try {
        generated = candidate.provider === 'anthropic'
          ? await callAnthropic(key, candidate.id, body.prompt.trim(), currentSpecification, signal)
          : await callOpenRouter(key, candidate.id, body.prompt.trim(), currentSpecification, signal)
        break
      } catch {
        const nextCandidate = candidates[index + 1]
        if (plan.selected.tier === 'flagship' && nextCandidate && nextCandidate.tier !== 'flagship' && !allowDowngrade) {
          return jsonError(409, 'The selected model could not finish. Continue with a lower-tier Lotus model?', 'DOWNGRADE_CONSENT_REQUIRED', headers)
        }
        // Try one configured fallback, without exposing provider details to the app.
      }
    }
    if (!generated) return jsonError(502, 'The AI provider could not complete this request. Try again.', 'UPSTREAM_ERROR', headers)

    let result
    try {
      result = validateGenerationResult(generated.result)
    } catch {
      return jsonError(502, 'The AI response did not match Lotus’s app schema. Try again.', 'INVALID_MODEL_OUTPUT', headers)
    }

    const normalizedUsage = normalizeUsage(generated.usage)
    await Promise.all([
      recordAiUsage({
        userId: user.id,
        projectId: null,
        model,
        usage: generated.usage,
        requestType: 'native_generation',
      }),
      recordRoutingOutcome({
        userId: user.id,
        projectId: null,
        requestType: 'native_generation',
        selectedAlias: plan.selected.alias,
        complexityLevel: plan.classification.level,
        succeeded: true,
        validationSucceeded: true,
        escalated: model.alias !== plan.selected.alias,
        finalAlias: model.alias,
        latencyMs: Date.now() - startedAt,
        totalTokens: normalizedUsage.inputTokens + normalizedUsage.outputTokens + normalizedUsage.reasoningTokens + normalizedUsage.cachedTokens,
        cost: normalizedUsage.cost,
      }),
    ]).catch(() => {
      console.error('Lotus native generation usage could not be recorded.')
    })

    return NextResponse.json(result, { status: 200, headers })
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required.') {
      return jsonError(401, 'Sign in to your Lotus account to generate apps.', 'UNAUTHORIZED', headers)
    }
    console.error('Lotus native generation request failed.')
    return jsonError(503, sanitizeProviderError(error), 'GENERATION_UNAVAILABLE', headers)
  }
}

