import { z } from 'zod'
import { postgresPool, row, rows } from '@/lib/db/postgres'

export type ProjectRole = 'owner' | 'editor' | 'viewer'

const SAFE_ASSET_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf', 'application/json', 'text/plain', 'text/csv',
])
const SENSITIVE_ANALYTICS_KEYS = /token|secret|password|credential|authorization|cookie|email|name/i

export const assetUploadSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(160).refine(value => !/[\\/\0]/.test(value), 'Use a plain file name.'),
  mimeType: z.string().refine(value => SAFE_ASSET_TYPES.has(value), 'This file type is not supported.'),
  size: z.number().int().positive().max(5 * 1024 * 1024),
})

const analyticsName = z.string().regex(/^[a-z][a-z0-9_.-]{1,63}$/)

export function canManageProject(role: ProjectRole) { return role === 'owner' }
export function canWriteProject(role: ProjectRole) { return role === 'owner' || role === 'editor' }

export function normalizeAnalyticsEvent(input: unknown) {
  const value = z.object({ name: analyticsName, properties: z.record(z.string(), z.unknown()).default({}) }).parse(input)
  const properties: Record<string, string | number | boolean | null> = {}
  for (const [key, candidate] of Object.entries(value.properties).slice(0, 12)) {
    if (SENSITIVE_ANALYTICS_KEYS.test(key) || !/^[a-z][a-z0-9_.-]{0,39}$/i.test(key)) continue
    if (candidate === null || typeof candidate === 'boolean' || typeof candidate === 'number') properties[key] = candidate
    else if (typeof candidate === 'string') properties[key] = candidate.slice(0, 160)
  }
  return { name: value.name, properties }
}

export async function getProjectRole(userId: string, projectId: string): Promise<ProjectRole | null> {
  const access = await row<{ role: ProjectRole }>(postgresPool, `SELECT CASE WHEN p."userId" = $1 THEN 'owner' ELSE pm.role END AS role
    FROM project p LEFT JOIN project_member pm ON pm."projectId" = p.id AND pm."userId" = $1
    WHERE p.id = $2 AND (p."userId" = $1 OR pm."userId" IS NOT NULL) LIMIT 1`, [userId, projectId])
  return access?.role ?? null
}

async function requireRole(userId: string, projectId: string, permission: 'read' | 'write' | 'manage') {
  const role = await getProjectRole(userId, projectId)
  if (!role || (permission === 'write' && !canWriteProject(role)) || (permission === 'manage' && !canManageProject(role))) throw new Error('Project access denied.')
  return role
}

async function enforceMutationRate(userId:string, projectId:string, prefix:string, limit:number) {
  const recent = await row<{ count:string }>(postgresPool, `SELECT COUNT(*)::text AS count FROM project_audit_log
    WHERE "projectId"=$1 AND "actorId"=$2 AND action LIKE $3 AND "createdAt">=now()-interval '1 minute'`, [projectId,userId,`${prefix}%`])
  if(Number(recent?.count??0)>=limit)throw new Error('Too many workspace changes. Wait a minute and try again.')
}

export async function listProjectMembers(userId: string, projectId: string) {
  await requireRole(userId, projectId, 'read')
  return rows<{ userId:string; name:string; email:string; role:ProjectRole; createdAt:Date }>(postgresPool, `SELECT u.id AS "userId", u.name, u.email, 'owner'::text AS role, p."createdAt"
    FROM project p JOIN "user" u ON u.id = p."userId" WHERE p.id = $1
    UNION ALL
    SELECT u.id, u.name, u.email, pm.role, pm."createdAt" FROM project_member pm JOIN "user" u ON u.id = pm."userId" WHERE pm."projectId" = $1
    ORDER BY "createdAt"`, [projectId])
}

export async function upsertProjectMember(ownerId: string, projectId: string, email: string, role: 'editor' | 'viewer') {
  await requireRole(ownerId, projectId, 'manage')
  await enforceMutationRate(ownerId,projectId,'member.',10)
  const normalizedEmail = z.string().trim().toLowerCase().email().max(254).parse(email)
  const member = await row<{ id:string; name:string; email:string }>(postgresPool, 'SELECT id, name, email FROM "user" WHERE lower(email) = $1 LIMIT 1', [normalizedEmail])
  if (!member) throw new Error('That person must create a Lucky Lotus account before they can be added.')
  if (member.id === ownerId) throw new Error('The project owner is already a member.')
  await postgresPool.query(`INSERT INTO project_member ("projectId", "userId", role, "invitedBy") VALUES ($1,$2,$3,$4)
    ON CONFLICT ("projectId","userId") DO UPDATE SET role=EXCLUDED.role,"updatedAt"=now()`, [projectId, member.id, role, ownerId])
  await audit(projectId, ownerId, 'member.upserted', { memberId: member.id, role })
  return { ...member, userId: member.id, role }
}

export async function removeProjectMember(ownerId: string, projectId: string, memberId: string) {
  await requireRole(ownerId, projectId, 'manage')
  await enforceMutationRate(ownerId,projectId,'member.',10)
  const result = await postgresPool.query('DELETE FROM project_member WHERE "projectId"=$1 AND "userId"=$2', [projectId, memberId])
  if (!result.rowCount) throw new Error('Team member not found.')
  await audit(projectId, ownerId, 'member.removed', { memberId })
}

export async function listProjectAssets(userId: string, projectId: string) {
  await requireRole(userId, projectId, 'read')
  return rows<{ id:string; name:string; mimeType:string; size:number; createdAt:Date; uploadedByName:string }>(postgresPool, `SELECT a.id,a.name,a."mimeType",a.size,a."createdAt",u.name AS "uploadedByName"
    FROM project_asset a JOIN "user" u ON u.id=a."uploadedBy" WHERE a."projectId"=$1 ORDER BY a."createdAt" DESC LIMIT 100`, [projectId])
}

export async function storeProjectAsset(userId: string, input: unknown, content: Buffer) {
  const asset = assetUploadSchema.parse(input)
  await requireRole(userId, asset.projectId, 'write')
  await enforceMutationRate(userId,asset.projectId,'asset.',20)
  if (content.byteLength !== asset.size) throw new Error('Uploaded file size did not match its contents.')
  const total = await row<{ total:string }>(postgresPool, 'SELECT COALESCE(SUM(size),0)::text AS total FROM project_asset WHERE "projectId"=$1', [asset.projectId])
  if (Number(total?.total ?? 0) + asset.size > 50 * 1024 * 1024) throw new Error('This project has reached its 50 MB asset limit.')
  const id = crypto.randomUUID()
  await postgresPool.query('INSERT INTO project_asset (id,"projectId","uploadedBy",name,"mimeType",size,content) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, asset.projectId, userId, asset.name, asset.mimeType, asset.size, content])
  await audit(asset.projectId, userId, 'asset.uploaded', { assetId: id, size: asset.size, mimeType: asset.mimeType })
  return { id, ...asset }
}

export async function getProjectAsset(userId: string, assetId: string) {
  const asset = await row<{ id:string; projectId:string; name:string; mimeType:string; size:number; content:Buffer }>(postgresPool, 'SELECT id,"projectId",name,"mimeType",size,content FROM project_asset WHERE id=$1', [assetId])
  if (!asset) return null
  await requireRole(userId, asset.projectId, 'read')
  return asset
}

export async function deleteProjectAsset(userId: string, projectId: string, assetId: string) {
  await requireRole(userId, projectId, 'write')
  await enforceMutationRate(userId,projectId,'asset.',20)
  const result = await postgresPool.query('DELETE FROM project_asset WHERE id=$1 AND "projectId"=$2', [assetId, projectId])
  if (!result.rowCount) throw new Error('Asset not found.')
  await audit(projectId, userId, 'asset.deleted', { assetId })
}

export async function recordAnalyticsEvent(userId: string | null, projectId: string, input: unknown) {
  if (userId) await requireRole(userId, projectId, 'read')
  const event = normalizeAnalyticsEvent(input)
  await postgresPool.query('INSERT INTO analytics_event (id,"projectId","userId",name,properties) VALUES ($1,$2,$3,$4,$5)', [crypto.randomUUID(), projectId, userId, event.name, event.properties])
}

export async function getAnalyticsSummary(userId: string, projectId: string, days = 30) {
  await requireRole(userId, projectId, 'read')
  const safeDays = Math.min(90, Math.max(1, Math.trunc(days)))
  const totals = await rows<{ name:string; count:string }>(postgresPool, `SELECT name,COUNT(*)::text AS count FROM analytics_event
    WHERE "projectId"=$1 AND "createdAt">=now()-($2::text||' days')::interval GROUP BY name ORDER BY COUNT(*) DESC LIMIT 20`, [projectId, safeDays])
  const daily = await rows<{ day:string; count:string }>(postgresPool, `SELECT to_char(date_trunc('day',"createdAt"),'YYYY-MM-DD') AS day,COUNT(*)::text AS count FROM analytics_event
    WHERE "projectId"=$1 AND "createdAt">=now()-($2::text||' days')::interval GROUP BY 1 ORDER BY 1`, [projectId, safeDays])
  return { days: safeDays, total: totals.reduce((sum,item)=>sum+Number(item.count),0), events: totals.map(item=>({name:item.name,count:Number(item.count)})), daily: daily.map(item=>({day:item.day,count:Number(item.count)})) }
}

async function audit(projectId: string, actorId: string, action: string, metadata: Record<string, unknown>) {
  await postgresPool.query('INSERT INTO project_audit_log (id,"projectId","actorId",action,metadata) VALUES ($1,$2,$3,$4,$5)', [crypto.randomUUID(), projectId, actorId, action, metadata])
}
