import { describe, expect, it } from 'vitest'
import {
  LOTUS_MODELS,
  classifyTask,
  createRoutingPlan,
  estimateTaskSize,
  normalizeUsage,
  sanitizeProviderError,
} from '@/lib/ai-platform'

describe('Lotus AI platform', () => {
  it('keeps external model ids behind stable Lotus aliases', () => {
    expect(LOTUS_MODELS.map(model => model.alias)).toEqual([
      'lotus.flagship', 'lotus.performance', 'lotus.fast', 'lotus.economy', 'lotus.free',
    ])
    expect(LOTUS_MODELS.every(model => model.id && model.displayName && model.contextWindow > 0)).toBe(true)
  })

  it.each([
    ['Change this button text.', 1],
    ['Create a login component with validation.', 2],
    ['Add a dashboard feature with API integration.', 3],
    ['Refactor the authentication architecture across the repository.', 4],
    ["Fix production. Three earlier attempts failed and migrations are destructive.", 5],
  ])('classifies %s as complexity %i', (prompt, level) => {
    expect(classifyTask({ prompt }).level).toBe(level)
  })

  it('routes by capability, connected providers, preference, and explicit modes', () => {
    const providers = { anthropic: true, openrouter: true } as const
    expect(createRoutingPlan({ prompt: 'Build the entire application', mode: 'auto', costPreference: 'balanced', providers }).selected.alias).toBe('lotus.flagship')
    expect(createRoutingPlan({ prompt: 'Change this button text', mode: 'auto', costPreference: 'balanced', providers }).selected.alias).toBe('lotus.economy')
    expect(createRoutingPlan({ prompt: 'Build a component', mode: 'free', costPreference: 'balanced', providers }).selected.alias).toBe('lotus.free')
    expect(createRoutingPlan({ prompt: 'Implement authentication and database migrations', mode: 'auto', costPreference: 'save_tokens', providers }).selected.alias).toBe('lotus.flagship')
  })

  it('does not silently route a complex task to free when Anthropic is unavailable', () => {
    const plan = createRoutingPlan({ prompt: 'Build this entire application', mode: 'auto', costPreference: 'balanced', providers: { anthropic: false, openrouter: true } })
    expect(plan.requiresDowngradeConsent).toBe(true)
    expect(plan.selected.alias).not.toBe('lotus.free')
  })

  it('creates a bounded escalation sequence without repeating failed weak models', () => {
    const plan = createRoutingPlan({ prompt: 'Create a normal application feature', mode: 'auto', costPreference: 'balanced', providers: { anthropic: true, openrouter: true }, maxEscalationLevel: 5 })
    expect(new Set(plan.attempts.map(item => item.alias)).size).toBe(plan.attempts.length)
    expect(plan.attempts.at(-1)?.alias).toBe('lotus.flagship')
    const capped=createRoutingPlan({prompt:'Create a normal application feature',mode:'auto',costPreference:'balanced',providers:{anthropic:true,openrouter:true},maxEscalationLevel:3})
    expect(capped.attempts.map(item=>item.alias)).not.toContain('lotus.flagship')
  })

  it('normalizes actual provider usage without fabricating missing cost or balance', () => {
    expect(normalizeUsage({ inputTokens: 120, outputTokens: 30, reasoningTokens: 8, cachedInputTokens: 11 })).toEqual({ inputTokens: 120, outputTokens: 30, reasoningTokens: 8, cachedTokens: 11, cost: null })
    expect(normalizeUsage({})).toEqual({ inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, cost: null })
  })

  it('estimates task size and strips provider secrets from public errors', () => {
    expect(estimateTaskSize({ prompt: 'x', contextCharacters: 900_000 }).label).toBe('Very Large')
    expect(sanitizeProviderError(new Error('401 invalid sk-ant-secret-value'))).not.toContain('sk-ant')
    expect(sanitizeProviderError(new Error('429 rate limit reached'))).toBe('The provider is temporarily rate limited.')
    expect(sanitizeProviderError('offline')).toBe('The AI provider could not complete the request.')
    expect(estimateTaskSize({prompt:'x',contextCharacters:50_000}).label).toBe('Medium')
  })
})
