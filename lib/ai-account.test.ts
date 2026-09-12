import { beforeEach,describe,expect,it,vi } from 'vitest'
import { completeAiOnboarding,getAiProfile,getAiUsageSummary,getOpenRouterCredit,getProviderKey,listProviderStatuses,recordAiUsage,recordRoutingOutcome,removeProviderCredential,saveProviderCredential,testProviderCredential,updateAiPreferences } from '@/lib/ai-account'
import { LOTUS_MODELS } from '@/lib/ai-platform'
import type { PostgresExecutor } from '@/lib/db/postgres'

beforeEach(()=>{process.env.API_KEY_ENCRYPTION_SECRET='test-only-encryption-secret-that-is-long-enough'})

describe('AI account secrets',()=>{
  it('verifies and persists only ciphertext plus a masked hint',async()=>{
    const stored:{encryptedKey?:string;keyHint?:string}={}
    const executor={query:vi.fn(async(text:string,values:unknown[]=[])=>{
      if(text.startsWith('SELECT count'))return {rows:[{count:'0'}]}
      if(text.startsWith('INSERT INTO ai_provider_credential')){stored.encryptedKey=String(values[2]);stored.keyHint=String(values[3]);return {rows:[]}}
      if(text.startsWith('SELECT "keyHint"'))return {rows:[{keyHint:stored.keyHint,status:'connected',lastCheckedAt:new Date('2026-09-11'),lastSuccessAt:new Date('2026-09-11')}]}
      if(text.startsWith('SELECT "encryptedKey"'))return {rows:[{encryptedKey:stored.encryptedKey}]}
      return {rows:[]}
    })} as unknown as PostgresExecutor
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({data:[]}),{status:200})) as unknown as typeof fetch
    const secret='sk-ant-production-shaped-secret-1234'
    const result=await saveProviderCredential('user-1',{provider:'anthropic',apiKey:secret},executor,fetcher)
    expect(result.ok).toBe(true)
    expect(stored.encryptedKey).not.toContain(secret)
    expect(stored.keyHint).toBe('••••••••••1234')
    await expect(getProviderKey('user-1','anthropic',executor)).resolves.toBe(secret)
  })

  it('rejects invalid keys and shared-store rate limit violations',async()=>{
    const invalidExecutor={query:vi.fn(async(text:string)=>text.startsWith('SELECT count')?{rows:[{count:'0'}]}:{rows:[]})} as unknown as PostgresExecutor
    const unauthorized=vi.fn(async()=>new Response('{}',{status:401})) as unknown as typeof fetch
    await expect(saveProviderCredential('user-1',{provider:'openrouter',apiKey:'sk-or-invalid-but-shaped'},invalidExecutor,unauthorized)).resolves.toMatchObject({ok:false,status:'invalid'})
    const limited={query:vi.fn(async()=>({rows:[{count:'6'}]}))} as unknown as PostgresExecutor
    await expect(saveProviderCredential('user-1',{provider:'anthropic',apiKey:'sk-ant-valid-shaped-key'},limited,unauthorized)).rejects.toThrow('Too many connection attempts')
  })

  it('persists onboarding and validated preferences',async()=>{
    const profile={onboardingCompleted:true,defaultMode:'fast',costPreference:'quality_first',maxEscalationLevel:4}
    const executor={query:vi.fn(async(text:string)=>text.startsWith('SELECT "onboardingCompleted"')?{rows:[profile]}:{rows:[]})} as unknown as PostgresExecutor
    await completeAiOnboarding('user-1',executor)
    await expect(updateAiPreferences('user-1',{defaultMode:'fast',costPreference:'quality_first',maxEscalationLevel:4},executor)).resolves.toEqual(profile)
    await expect(getAiProfile('user-1',executor)).resolves.toEqual(profile)
    await expect(updateAiPreferences('user-1',{defaultMode:'unsafe',costPreference:'balanced',maxEscalationLevel:9},executor)).rejects.toThrow()
  })

  it('returns only disconnected status when credentials do not exist',async()=>{
    const executor={query:vi.fn(async()=>({rows:[]}))} as unknown as PostgresExecutor
    await expect(listProviderStatuses('user-1',executor)).resolves.toEqual([
      {provider:'anthropic',connected:false,keyHint:'',status:'disconnected',health:'unknown',lastCheckedAt:null,lastSuccessAt:null},
      {provider:'openrouter',connected:false,keyHint:'',status:'disconnected',health:'unknown',lastCheckedAt:null,lastSuccessAt:null},
    ])
    await expect(testProviderCredential('user-1','anthropic',executor)).resolves.toMatchObject({ok:false,error:'Not connected'})
    await removeProviderCredential('user-1','openrouter',executor)
  })

  it('records normalized usage and routing outcomes and summarizes real rows',async()=>{
    const executor={query:vi.fn(async(text:string)=>{
      if(text.includes('FILTER (WHERE'))return {rows:[{today:'12',week:'34',month:'56',cost:null}]}
      if(text.includes('GROUP BY "modelAlias"'))return {rows:[{modelAlias:'lotus.fast',tokens:'40'}]}
      if(text.includes('GROUP BY provider'))return {rows:[{provider:'openrouter',tokens:'40'}]}
      return {rows:[]}
    })} as unknown as PostgresExecutor
    await expect(recordAiUsage({userId:'u',projectId:null,model:LOTUS_MODELS[2],usage:{input_tokens:2,output_tokens:3},requestType:'test'},executor)).resolves.toMatchObject({inputTokens:2,outputTokens:3,cost:null})
    await recordRoutingOutcome({userId:'u',projectId:null,requestType:'test',selectedAlias:'lotus.fast',complexityLevel:2,succeeded:true,validationSucceeded:true,escalated:false,finalAlias:'lotus.fast',latencyMs:10,totalTokens:5,cost:null},executor)
    await expect(getAiUsageSummary('u',executor)).resolves.toEqual({today:12,week:34,month:56,estimatedSpend:null,byModels:[{modelAlias:'lotus.fast',tokens:40}],byProviders:[{provider:'openrouter',tokens:40}]})
  })

  it('uses only a provider-reported OpenRouter credit figure',async()=>{
    let encrypted=''
    const executor={query:vi.fn(async(text:string,values:unknown[]=[])=>{
      if(text.startsWith('SELECT count'))return {rows:[{count:'0'}]}
      if(text.startsWith('INSERT INTO ai_provider_credential')){encrypted=String(values[2]);return {rows:[]}}
      if(text.startsWith('SELECT "keyHint"'))return {rows:[{keyHint:'••••1234',status:'connected',lastCheckedAt:null,lastSuccessAt:null}]}
      if(text.startsWith('SELECT "encryptedKey"'))return {rows:[{encryptedKey:encrypted}]}
      return {rows:[]}
    })} as unknown as PostgresExecutor
    const ok=vi.fn(async()=>new Response(JSON.stringify({data:[]}),{status:200})) as unknown as typeof fetch
    await saveProviderCredential('u',{provider:'openrouter',apiKey:'sk-or-credit-key-1234'},executor,ok)
    const credit=vi.fn(async()=>new Response(JSON.stringify({data:{total_credits:10,total_usage:3.25}}),{status:200})) as unknown as typeof fetch
    await expect(getOpenRouterCredit('u',executor,credit)).resolves.toBe(6.75)
    await expect(getOpenRouterCredit('u',executor,vi.fn(async()=>new Response('{}',{status:500})) as unknown as typeof fetch)).resolves.toBeNull()
  })
})
