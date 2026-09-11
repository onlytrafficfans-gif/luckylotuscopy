// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), refresh: vi.fn(), promote: vi.fn(), publish: vi.fn(),
}))
vi.mock('@/app/actions/projects', () => ({
  listWebDeploymentsAction: actions.list,
  createVercelPreviewAction: actions.create,
  refreshVercelDeploymentAction: actions.refresh,
  promoteVercelDeploymentAction: actions.promote,
  publishProjectToGitHubAction: actions.publish,
}))
vi.mock('@/components/lotus/integration-settings', () => ({ IntegrationSettings: () => <div>Vercel connection</div> }))

import { WebDeploymentSettings } from '@/components/lotus/web-deployment-settings'

const ready = {
  id: 'record-1', userId: 'user-1', projectId: 'project-1', provider: 'vercel' as const, target: 'preview' as const,
  status: 'ready' as const, providerDeploymentId: 'dpl_1', providerProjectId: 'prj_1', name: 'app', url: 'https://app.vercel.app',
  error: null, promotedAt: null, createdAt: new Date(), updatedAt: new Date(),
}

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  actions.list.mockResolvedValue([ready])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('web deployment settings', () => {
  it('shows real deployment state and confirms production promotion', async () => {
    actions.promote.mockResolvedValue({ ok: true, deployment: { ...ready, target: 'production', promotedAt: new Date() } })
    render(<WebDeploymentSettings projectId="project-1" />)
    expect(await screen.findByText('https://app.vercel.app')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Promote to production' }))
    await waitFor(() => expect(actions.promote).toHaveBeenCalledWith('project-1', 'record-1'))
    expect(window.confirm).toHaveBeenCalled()
  })

  it('surfaces provider failures instead of reporting a fake success', async () => {
    actions.list.mockResolvedValue([])
    actions.create.mockResolvedValue({ ok: false, error: 'Connect Vercel in Integrations before deploying.' })
    render(<WebDeploymentSettings projectId="project-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Deploy preview' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Connect Vercel')
  })

  it('creates a private GitHub repository only after confirmation', async () => {
    actions.publish.mockResolvedValue({ ok: true, published: { repository: 'lotus/app', url: 'https://github.com/lotus/app', branch: 'main' } })
    render(<WebDeploymentSettings projectId="project-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Publish to GitHub' }))
    await waitFor(()=>expect(actions.publish).toHaveBeenCalledWith('project-1',true))
    expect(await screen.findByRole('link', { name: /Open repository/ })).toHaveAttribute('href','https://github.com/lotus/app')
  })
})
