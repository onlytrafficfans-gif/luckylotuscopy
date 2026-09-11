// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthForm } from '@/components/auth-form'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { email: vi.fn() }, signUp: { email: vi.fn() } } }))

afterEach(() => cleanup())

describe('AuthForm landing flow', () => {
  it('opens a centered clear sign-in panel over the full artwork', () => {
    render(<AuthForm />)
    expect(screen.getByAltText('Lucky Lotus garden at sunset')).toHaveClass('object-cover')
    expect(screen.getByRole('dialog', { name: 'Welcome back' })).toHaveClass('bg-white/[.12]')
  })

  it('switches between centered sign-in and sign-up panels', () => {
    render(<AuthForm initialMode="sign-in" />)
    fireEvent.click(screen.getByRole('button', { name: 'Create an account instead' }))
    expect(screen.getByRole('dialog', { name: 'Create an account' })).toBeInTheDocument()
  })
})
