import { NextResponse } from 'next/server'
import { runBuildAction } from '@/app/actions/projects'
import { postgresPool } from '@/lib/db/postgres'
import { requireCurrentUser } from '@/lib/auth-session'

export const runtime = 'nodejs'
export const maxDuration = 60

const maxPromptLength = 2_000
const maxCurrentHtmlLength = 120_000
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

function corsHeaders(origin: string | null) {
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

async function claimBuildSlot(userId: string) {
  const result = await postgresPool.query<{ minuteCount: number; dayCount: number }>(
    `INSERT INTO ai_native_generation_limit ("userId","minuteStartedAt","minuteCount","dayStartedAt","dayCount")
     VALUES ($1,now(),1,current_date,1)
     ON CONFLICT ("userId") DO UPDATE SET
       "minuteCount" = CASE WHEN ai_native_generation_limit."minuteStartedAt" <= now() - interval '1 minute' THEN 1 ELSE ai_native_generation_limit."minuteCount" + 1 END,
       "minuteStartedAt" = CASE WHEN ai_native_generation_limit."minuteStartedAt" <= now() - interval '1 minute' THEN now() ELSE ai_native_generation_limit."minuteStartedAt" END,
       "dayCount" = CASE WHEN ai_native_generation_limit."dayStartedAt" < current_date THEN 1 ELSE ai_native_generation_limit."dayCount" + 1 END,
       "dayStartedAt" = CASE WHEN ai_native_generation_limit."dayStartedAt" < current_date THEN current_date ELSE ai_native_generation_limit."dayStartedAt" END
     RETURNING "minuteCount","dayCount"`,
    [userId],
  )
  return result.rows[0]
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
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 200_000) return NextResponse.json({ error: 'The request is too large.', code: 'REQUEST_TOO_LARGE' }, { status: 413, headers })

  let body: { projectId?: unknown; prompt?: unknown; currentHtml?: unknown; allowDowngrade?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'The request body must be valid JSON.', code: 'INVALID_JSON' }, { status: 400, headers })
  }
  if (typeof body.prompt !== 'string' || body.prompt.trim().length < 3 || body.prompt.length > maxPromptLength) {
    return NextResponse.json({ error: 'Enter a request between 3 and 2,000 characters.', code: 'INVALID_PROMPT' }, { status: 400, headers })
  }
  if (body.projectId !== undefined && body.projectId !== null && (typeof body.projectId !== 'string' || body.projectId.length > 100)) {
    return NextResponse.json({ error: 'The project could not be read.', code: 'INVALID_PROJECT' }, { status: 400, headers })
  }
  if (body.currentHtml !== undefined && body.currentHtml !== null && (typeof body.currentHtml !== 'string' || body.currentHtml.length > maxCurrentHtmlLength)) {
    return NextResponse.json({ error: 'The current app is too large to update from this device.', code: 'APP_TOO_LARGE' }, { status: 413, headers })
  }

  try {
    const user = await requireCurrentUser()
    const limits = await claimBuildSlot(user.id)
    if (!limits || limits.minuteCount > 8 || limits.dayCount > 100) {
      return NextResponse.json({ error: 'Build limit reached. Wait a moment and try again.', code: 'RATE_LIMITED' }, { status: 429, headers })
    }
    const result = await runBuildAction({
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
      prompt: body.prompt.trim(),
      model: 'default',
      currentHtml: typeof body.currentHtml === 'string' ? body.currentHtml : null,
      allowDowngrade: body.allowDowngrade === true,
    })
    if (!result.ok) {
      const status = result.confirmation === 'downgrade' ? 409 : 502
      return NextResponse.json({ error: result.error, code: result.confirmation === 'downgrade' ? 'DOWNGRADE_CONSENT_REQUIRED' : 'BUILD_FAILED', confirmation: result.confirmation }, { status, headers })
    }
    return NextResponse.json(result.data, { status: 200, headers })
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required.') {
      return NextResponse.json({ error: 'Sign in to your Lotus account to build apps.', code: 'UNAUTHORIZED' }, { status: 401, headers })
    }
    return NextResponse.json({ error: 'The app build could not be completed. Check your Lotus AI provider setup and try again.', code: 'BUILD_UNAVAILABLE' }, { status: 503, headers })
  }
}

