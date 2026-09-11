// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }))
vi.mock('@/app/actions/projects', () => ({ getBackendModelAction: actions.get, saveBackendModelAction: actions.save }))
import { BackendWorkspace } from '@/components/lotus/backend-workspace'

beforeEach(() => {
  vi.clearAllMocks()
  actions.get.mockResolvedValue({ data: { entities: [] } })
  actions.save.mockResolvedValue({ ok: true, files: ['backend/schema.sql', 'backend/models.ts'] })
})
afterEach(cleanup)

describe('backend workspace', () => {
  it('builds and persists entities instead of showing placeholder tables', async () => {
    render(<BackendWorkspace projects={[{ id: 'project-1', name: 'Bookings' }]}/>)
    await screen.findByText(/No pretend tables/)
    fireEvent.change(screen.getByLabelText('New entity name'), { target: { value: 'Booking' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add entity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }))
    fireEvent.change(screen.getByLabelText('Booking field name'), { target: { value: 'Customer email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save model & generate backend files' }))
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith('project-1', [expect.objectContaining({ id: 'booking', fields: [expect.objectContaining({ id: 'customer-email' })] })]))
    expect(await screen.findByRole('status')).toHaveTextContent('backend/schema.sql')
  })
})
