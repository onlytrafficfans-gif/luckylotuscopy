import { postgresPool, row, rows } from '@/lib/db/postgres'
import type { DeploymentStatus, VercelDeploymentState } from '@/lib/vercel-deployment'

export interface DeploymentRecord {
  id: string
  userId: string
  projectId: string
  provider: 'vercel'
  target: 'preview' | 'production'
  status: DeploymentStatus
  providerDeploymentId: string
  providerProjectId: string
  name: string
  url: string | null
  error: string | null
  promotedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export async function createDeploymentRecord(userId: string, projectId: string, state: VercelDeploymentState) {
  const id = crypto.randomUUID()
  const saved = await row<DeploymentRecord>(postgresPool, `INSERT INTO deployment_record
    (id, "userId", "projectId", provider, target, status, "providerDeploymentId", "providerProjectId", name, url, error)
    VALUES ($1, $2, $3, 'vercel', 'preview', $4, $5, $6, $7, $8, $9) RETURNING *`,
  [id, userId, projectId, state.status, state.providerDeploymentId, state.providerProjectId, state.name, state.url, state.error])
  if (!saved) throw new Error('Deployment record could not be saved.')
  return saved
}

export async function listDeploymentRecords(userId: string, projectId: string) {
  return rows<DeploymentRecord>(postgresPool, `SELECT * FROM deployment_record
    WHERE "userId" = $1 AND "projectId" = $2 ORDER BY "createdAt" DESC LIMIT 25`, [userId, projectId])
}

export async function getDeploymentRecord(userId: string, projectId: string, recordId: string) {
  return (await row<DeploymentRecord>(postgresPool, `SELECT * FROM deployment_record
    WHERE id = $1 AND "userId" = $2 AND "projectId" = $3 LIMIT 1`, [recordId, userId, projectId])) ?? null
}

export async function updateDeploymentRecord(userId: string, projectId: string, recordId: string, state: VercelDeploymentState) {
  const saved = await row<DeploymentRecord>(postgresPool, `UPDATE deployment_record SET status = $1, url = $2, error = $3,
    "providerProjectId" = $4, name = $5, "updatedAt" = now()
    WHERE id = $6 AND "userId" = $7 AND "projectId" = $8 RETURNING *`,
  [state.status, state.url, state.error, state.providerProjectId, state.name, recordId, userId, projectId])
  if (!saved) throw new Error('Deployment record not found.')
  return saved
}

export async function markDeploymentPromoted(userId: string, projectId: string, recordId: string) {
  const saved = await row<DeploymentRecord>(postgresPool, `UPDATE deployment_record SET target = 'production', "promotedAt" = now(), "updatedAt" = now()
    WHERE id = $1 AND "userId" = $2 AND "projectId" = $3 AND status = 'ready' RETURNING *`, [recordId, userId, projectId])
  if (!saved) throw new Error('Only a ready preview deployment can be promoted.')
  return saved
}
