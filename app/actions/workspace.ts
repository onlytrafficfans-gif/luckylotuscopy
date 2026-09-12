'use server'

import { revalidatePath } from 'next/cache'
import { requireCurrentUser } from '@/lib/auth-session'
import { deleteProjectAsset, getAnalyticsSummary, getProjectRole, listProjectAssets, listProjectMembers, recordAnalyticsEvent, removeProjectMember, storeProjectAsset, upsertProjectMember } from '@/lib/workspace-features'

function requirePostgres() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === 'test') throw new Error('Production workspace storage is not configured.')
}

export async function getWorkspaceFeaturesAction(projectId: string) {
  requirePostgres()
  const user = await requireCurrentUser()
  const role = await getProjectRole(user.id, projectId)
  if (!role) throw new Error('Project access denied.')
  const [members, assets, analytics] = await Promise.all([
    listProjectMembers(user.id, projectId), listProjectAssets(user.id, projectId), getAnalyticsSummary(user.id, projectId),
  ])
  return { role, members, assets, analytics }
}

export async function addProjectMemberAction(projectId: string, email: string, role: 'editor' | 'viewer') {
  requirePostgres()
  const user = await requireCurrentUser()
  await upsertProjectMember(user.id, projectId, email, role)
  revalidatePath('/')
}

export async function removeProjectMemberAction(projectId: string, memberId: string) {
  requirePostgres()
  const user = await requireCurrentUser()
  await removeProjectMember(user.id, projectId, memberId)
  revalidatePath('/')
}

export async function uploadProjectAssetAction(formData: FormData) {
  requirePostgres()
  const user = await requireCurrentUser()
  const projectId = String(formData.get('projectId') ?? '')
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('Choose a file to upload.')
  await storeProjectAsset(user.id, { projectId, name:file.name, mimeType:file.type, size:file.size }, Buffer.from(await file.arrayBuffer()))
  revalidatePath('/')
}

export async function deleteProjectAssetAction(projectId: string, assetId: string) {
  requirePostgres()
  const user = await requireCurrentUser()
  await deleteProjectAsset(user.id, projectId, assetId)
  revalidatePath('/')
}

export async function trackProjectEventAction(projectId: string, name: string, properties: Record<string, unknown> = {}) {
  requirePostgres()
  const user = await requireCurrentUser()
  await recordAnalyticsEvent(user.id, projectId, { name, properties })
}
