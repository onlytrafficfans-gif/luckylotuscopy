// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmptyPreview } from '@/components/lotus/builder'

afterEach(() => cleanup())

describe('EmptyPreview', () => {
  it('shows the start-building guidance inside a phone preview screen', () => {
    render(<EmptyPreview />)

    const phone = screen.getByRole('region', { name: 'Phone preview screen' })
    expect(phone).toBeInTheDocument()
    expect(phone).toHaveTextContent('Start building')
    expect(phone).toHaveTextContent('Describe what you want to build in the chat.')
  })

  it('does not ship the legacy mock builder controls', () => {
    const source = readFileSync(join(process.cwd(), 'components/lotus/builder.tsx'), 'utf8')

    expect(source).not.toContain('Mock data')
    expect(source).not.toContain('INIT_CONNECTORS')
    expect(source).not.toContain('INIT_SKILLS')
    expect(source).not.toContain('INIT_AGENTS')
    expect(source).not.toContain('Add Function')
  })
})
