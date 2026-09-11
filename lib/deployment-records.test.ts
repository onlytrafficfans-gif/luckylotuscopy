import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/postgres', () => ({
  postgresPool: { query },
  row: vi.fn(async (_executor, sql: string, values: unknown[]) => (await query(sql, values)).rows[0]),
  rows: vi.fn(async (_executor, sql: string, values: unknown[]) => (await query(sql, values)).rows),
}))

import { createDeploymentRecord, listDeploymentRecords, updateDeploymentRecord } from '@/lib/deployment-records'

describe('deployment records', () => {
  beforeEach(() => query.mockReset())

  it('creates an owner-scoped preview deployment record', async () => {
    const saved = { id: 'local-1', userId: 'user-1', projectId: 'project-1', provider: 'vercel', target: 'preview', status: 'queued' }
    query.mockResolvedValue({ rows: [saved] })
    await expect(createDeploymentRecord('user-1', 'project-1', { providerDeploymentId: 'dpl_1', providerProjectId: 'prj_1', name: 'app', status: 'queued', url: null, error: null })).resolves.toMatchObject(saved)
    expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining(['user-1', 'project-1', 'dpl_1', 'prj_1']))
  })

  it('lists and updates only records belonging to the current user and project', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'local-1', userId: 'user-1', projectId: 'project-1', status: 'ready' }] })
    await listDeploymentRecords('user-1', 'project-1')
    await updateDeploymentRecord('user-1', 'project-1', 'local-1', { providerDeploymentId: 'dpl_1', providerProjectId: 'prj_1', name: 'app', status: 'ready', url: 'https://app.vercel.app', error: null })
    expect(query.mock.calls[0][1]).toEqual(['user-1', 'project-1'])
    expect(query.mock.calls[1][1]).toEqual(expect.arrayContaining(['local-1', 'user-1', 'project-1']))
    expect(String(query.mock.calls[1][0])).toMatch(/"userId" = \$\d+ AND "projectId" = \$\d+/)
  })
})
