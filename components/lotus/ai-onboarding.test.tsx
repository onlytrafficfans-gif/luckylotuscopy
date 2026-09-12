// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { AiOnboarding } from '@/components/lotus/ai-onboarding'

const replace=vi.fn(),refresh=vi.fn(),complete=vi.fn(async()=>({ok:true as const}))
vi.mock('next/navigation',()=>({useRouter:()=>({replace,refresh})}))
vi.mock('@/app/actions/ai',()=>({completeAiOnboardingAction:()=>complete(),connectAiProviderAction:vi.fn()}))
afterEach(()=>{cleanup();vi.clearAllMocks()})

describe('AI onboarding',()=>{
  it('welcomes new accounts before showing both real provider connections',()=>{render(<AiOnboarding/>);expect(screen.getByRole('heading',{name:'Welcome to Lotus'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Continue'}));expect(screen.getByLabelText('Anthropic API key')).toBeInTheDocument();expect(screen.getByLabelText('OpenRouter API key')).toBeInTheDocument()})
  it('allows launch without keys and persists the completed state',async()=>{render(<AiOnboarding/>);fireEvent.click(screen.getByRole('button',{name:'Continue'}));fireEvent.click(screen.getByRole('button',{name:"I'll do this later"}));await waitFor(()=>expect(complete).toHaveBeenCalledOnce());expect(replace).toHaveBeenCalledWith('/')})
})
