// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthForm } from '@/components/auth-form'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { email: vi.fn() }, signUp: { email: vi.fn() } } }))

afterEach(() => cleanup())

describe('AuthForm landing flow', () => {
  it('shows the full artwork before opening either form', () => {
    render(<AuthForm />)
    expect(screen.getByAltText('Lucky Lotus garden at sunset')).toHaveClass('object-contain')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument()
  })

  it('opens, switches, and closes the authentication panel', () => {
    render(<AuthForm />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('dialog', { name: 'Welcome back' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create an account instead' }))
    expect(screen.getByRole('dialog', { name: 'Create an account' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
