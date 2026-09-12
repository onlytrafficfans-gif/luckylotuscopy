import type { Pool } from 'pg'
import type { Project, ProjectFile, ProjectRuntime, UserSettings } from '@/lib/db/schema'
import { postgresTransaction, row, rows, type PostgresExecutor } from '@/lib/db/postgres'
import { createProjectSpecification, parseProjectSpecification, type ProjectSpecification } from '@/lib/project-specification'
import { ProjectLifecycleError, type FileEncoding, type ProjectFileInput, type ProjectFileUpdate } from '@/lib/projects'
import { frameworkProjectSetup, type ProjectFramework } from '@/lib/project-framework'

const MAX_FILE_BYTES = 1_048_576
const MAX_PROJECT_BYTES = 5_242_880
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const DEFAULT_SETTINGS = { theme: 'system', editorFontSize: 14, autosaveInterval: 30, defaultDevice: 'phone' } as const

type SettingsInput = Partial<Pick<UserSettings, 'theme' | 'editorFontSize' | 'autosaveInterval' | 'defaultDevice'>>

function id() { return crypto.randomUUID() }

function normalizedName(name: string) {
  const value = name.trim().replace(/\s+/g, ' ')
  if (!value) throw new ProjectLifecycleError('Project name is required.')
  if (value.length > 100) throw new ProjectLifecycleError('Project name must be 100 characters or fewer.')
  return value
}

function normalizedCheckpointLabel(label: string) {
  const value = label.trim().replace(/\s+/g, ' ')
  if (!value) throw new ProjectLifecycleError('Checkpoint label is required.')
  if (value.length > 100) throw new ProjectLifecycleError('Checkpoint label must be 100 characters or fewer.')
  return value
}

function validatePath(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 240 || value.includes('\\') || value.startsWith('/') || value.includes('\0')) throw new ProjectLifecycleError('File path must be a safe relative path.')
  const parts = value.split('/')
  if (parts.some(part => WINDOWS_RESERVED.test(part))) throw new ProjectLifecycleError('File path contains a reserved Windows name.')
  if (parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part))) throw new ProjectLifecycleError('File path must be a safe relative path.')
  return value
}

function validateFileInput(input: ProjectFileInput) {
  const path = validatePath(input.path)
  if (typeof input.content !== 'string') throw new ProjectLifecycleError('File content must be text.')
  const encoding = input.encoding ?? 'utf-8'
  if (!['utf-8', 'utf-16le'].includes(encoding)) throw new ProjectLifecycleError('Encoding is not supported.')
  const bytes = Buffer.byteLength(input.content, encoding === 'utf-16le' ? 'utf16le' : 'utf8')
  if (bytes > MAX_FILE_BYTES) throw new ProjectLifecycleError('File is too large.')
  return { path, content: input.content, encoding, bytes }
}

function settingsValues(input: unknown): SettingsInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProjectLifecycleError('Settings payload is invalid.')
  const values = input as Record<string, unknown>
  if (Object.keys(values).some(key => !['theme', 'editorFontSize', 'autosaveInterval', 'defaultDevice'].includes(key))) throw new ProjectLifecycleError('Unrecognized setting.')
  const safe: SettingsInput = {}
  if (values.theme !== undefined) safe.theme = values.theme as UserSettings['theme']
  if (values.defaultDevice !== undefined) safe.defaultDevice = values.defaultDevice as UserSettings['defaultDevice']
  if (values.editorFontSize !== undefined) safe.editorFontSize = values.editorFontSize as number
  if (values.autosaveInterval !== undefined) safe.autosaveInterval = values.autosaveInterval as number
  if (safe.theme && !['system', 'light', 'dark'].includes(safe.theme)) throw new ProjectLifecycleError('Theme is invalid.')
  if (safe.defaultDevice && !['phone', 'tablet', 'desktop'].includes(safe.defaultDevice)) throw new ProjectLifecycleError('Default device is invalid.')
  if (safe.editorFontSize !== undefined && (!Number.isInteger(safe.editorFontSize) || safe.editorFontSize < 12 || safe.editorFontSize > 24)) throw new ProjectLifecycleError('Editor font size must be between 12 and 24.')
  if (safe.autosaveInterval !== undefined && (!Number.isInteger(safe.autosaveInterval) || safe.autosaveInterval < 5 || safe.autosaveInterval > 300)) throw new ProjectLifecycleError('Autosave interval must be between 5 and 300 seconds.')
  return safe
}

async function owned(executor: PostgresExecutor, userId: string, projectId: string, lock = false) {
  const project = await row<Project>(executor, `SELECT p.* FROM project p LEFT JOIN project_member pm ON pm."projectId"=p.id AND pm."userId"=$2
    WHERE p.id=$1 AND (p."userId"=$2 OR pm."userId" IS NOT NULL)${lock ? ' FOR UPDATE OF p' : ''}`, [projectId, userId])
  if (!project) throw new ProjectLifecycleError('Project not found.')
  return project
}

async function writable(executor: PostgresExecutor, userId: string, projectId: string) {
  const project = await owned(executor, userId, projectId, true)
  const access = await row<{ allowed:boolean }>(executor, `SELECT (p."userId"=$2 OR pm.role='editor') AS allowed FROM project p
    LEFT JOIN project_member pm ON pm."projectId"=p.id AND pm."userId"=$2 WHERE p.id=$1`, [projectId, userId])
  if (!access?.allowed) throw new ProjectLifecycleError('This project is read-only for your account.')
  if (project.status !== 'active') throw new ProjectLifecycleError('Files can only be changed in an active project.')
  return project
}

async function manageable(executor: PostgresExecutor, userId: string, projectId: string) {
  const project = await row<Project>(executor, 'SELECT * FROM project WHERE id=$1 AND "userId"=$2', [projectId, userId])
  if (!project) throw new ProjectLifecycleError('Only the project owner can perform this action.')
  return project
}

async function findFile(executor: PostgresExecutor, userId: string, projectId: string, fileId: string, includeTrashed = false) {
  await owned(executor,userId,projectId)
  return row<ProjectFile>(executor, `SELECT * FROM project_file WHERE id=$1 AND "projectId"=$2${includeTrashed ? '' : ' AND "deletedAt" IS NULL'} LIMIT 1`, [fileId,projectId])
}

async function availablePath(executor: PostgresExecutor, projectId: string, path: string, ignoredFileId?: string) {
  const existing = await row<{ id: string }>(executor, `SELECT id FROM project_file WHERE "projectId" = $1 AND path = $2 AND "deletedAt" IS NULL${ignoredFileId ? ' AND id <> $3' : ''} LIMIT 1`, ignoredFileId ? [projectId, path, ignoredFileId] : [projectId, path])
  if (existing) throw new ProjectLifecycleError('A file already exists at that path.')
}

async function capacity(executor: PostgresExecutor, projectId: string, nextBytes: number, existingBytes = 0) {
  const total = await row<{ total: string }>(executor, 'SELECT COALESCE(SUM(size), 0)::text AS total FROM project_file WHERE "projectId" = $1 AND "deletedAt" IS NULL', [projectId])
  if (Number(total?.total ?? 0) - existingBytes + nextBytes > MAX_PROJECT_BYTES) throw new ProjectLifecycleError('Project size limit exceeded.')
}

async function touch(executor: PostgresExecutor, projectId: string, at = new Date()) {
  await executor.query('UPDATE project SET "updatedAt" = $1 WHERE id = $2', [at, projectId])
}

export function createPostgresProjectService(pool: Pool) {
  async function getSettings(userId: string) {
    await pool.query(`INSERT INTO user_settings ("userId", theme, "editorFontSize", "autosaveInterval", "defaultDevice")
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userId") DO NOTHING`, [userId, DEFAULT_SETTINGS.theme, DEFAULT_SETTINGS.editorFontSize, DEFAULT_SETTINGS.autosaveInterval, DEFAULT_SETTINGS.defaultDevice])
    const settings = await row<UserSettings>(pool, 'SELECT * FROM user_settings WHERE "userId" = $1', [userId])
    if (!settings) throw new ProjectLifecycleError('Unable to initialize settings.')
    return settings
  }

  return {
    async list(userId: string) { return rows<Project>(pool, `SELECT DISTINCT p.* FROM project p LEFT JOIN project_member pm ON pm."projectId"=p.id AND pm."userId"=$1 WHERE p."userId"=$1 OR pm."userId" IS NOT NULL ORDER BY p."updatedAt" DESC`, [userId]) },
    async listDashboard(userId: string) { return rows<Pick<Project, 'id' | 'name' | 'status' | 'updatedAt'> & { framework: string }>(pool, `SELECT DISTINCT p.id,p.name,p.status,p."updatedAt",COALESCE(r.framework,'static') AS framework FROM project p LEFT JOIN project_runtime r ON r."projectId"=p.id LEFT JOIN project_member pm ON pm."projectId"=p.id AND pm."userId"=$1 WHERE p."userId"=$1 OR pm."userId" IS NOT NULL ORDER BY p."updatedAt" DESC LIMIT 100`, [userId]) },
    async get(userId: string, projectId: string) { return (await row<Project>(pool, `SELECT p.* FROM project p LEFT JOIN project_member pm ON pm."projectId"=p.id AND pm."userId"=$2 WHERE p.id=$1 AND (p."userId"=$2 OR pm."userId" IS NOT NULL) LIMIT 1`, [projectId,userId])) ?? null },
    async getSpecification(userId: string, projectId: string) {
      await owned(pool, userId, projectId)
      const value = await row<{ specification: unknown }>(pool, 'SELECT specification FROM project_specification WHERE "projectId" = $1', [projectId])
      if (!value) throw new ProjectLifecycleError('Project specification is unavailable.')
      return parseProjectSpecification(value.specification)
    },
    async updateSpecification(userId: string, projectId: string, input: unknown): Promise<ProjectSpecification> {
      const specification = parseProjectSpecification(input)
      await postgresTransaction(async client => {
        await writable(client, userId, projectId)
        await client.query(`INSERT INTO project_specification ("projectId", specification) VALUES ($1, $2)
          ON CONFLICT ("projectId") DO UPDATE SET specification = EXCLUDED.specification, "updatedAt" = now()`, [projectId, specification])
        await touch(client, projectId)
      })
      return specification
    },
    async createBlank(userId: string, name = 'Untitled project', framework: ProjectFramework = 'static') {
      const projectId = id()
      const projectName = normalizedName(name)
      const setup = frameworkProjectSetup(framework)
      await postgresTransaction(async client => {
        await client.query('INSERT INTO project (id, "userId", name) VALUES ($1, $2, $3)', [projectId, userId, projectName])
        await client.query('INSERT INTO project_runtime ("projectId", runtime, framework, "buildTool", "entryPath", metadata) VALUES ($1, $2, $3, $4, $5, $6)', [projectId, setup.runtime, setup.framework, setup.buildTool, setup.entryPath, setup.metadata])
        for (const starter of setup.files) {
          const file = validateFileInput(starter)
          await client.query('INSERT INTO project_file (id, "projectId", path, content, encoding, size) VALUES ($1, $2, $3, $4, $5, $6)', [id(), projectId, file.path, file.content, file.encoding, file.bytes])
        }
        await client.query('INSERT INTO project_specification ("projectId", specification) VALUES ($1, $2)', [projectId, createProjectSpecification({ name: projectName, prompt: `Build ${projectName}`, targets: [...setup.targets] })])
      })
      return owned(pool, userId, projectId)
    },
    async rename(userId: string, projectId: string, name: string) {
      const existing = await manageable(pool, userId, projectId)
      if (existing.status === 'trashed') throw new ProjectLifecycleError('A trashed project cannot be renamed.')
      return row<Project>(pool, 'UPDATE project SET name = $1, "updatedAt" = now() WHERE id = $2 AND "userId" = $3 RETURNING *', [normalizedName(name), projectId, userId])
    },
    async duplicate(userId: string, projectId: string) {
      const source = await owned(pool, userId, projectId)
      if (source.status === 'trashed') throw new ProjectLifecycleError('A trashed project cannot be duplicated.')
      const copyId = id()
      await postgresTransaction(async client => {
        await client.query('INSERT INTO project (id, "userId", name, mode) VALUES ($1, $2, $3, $4)', [copyId, userId, normalizedName(`${source.name.slice(0, 95).trimEnd()} copy`), source.mode])
        await client.query(`INSERT INTO project_runtime ("projectId", runtime, framework, "buildTool", "entryPath", metadata)
          SELECT $1, runtime, framework, "buildTool", "entryPath", metadata FROM project_runtime WHERE "projectId" = $2`, [copyId, projectId])
        await client.query(`INSERT INTO project_file (id, "projectId", path, content, encoding, size, "originalPath")
          SELECT gen_random_uuid()::text, $1, path, content, encoding, size, "originalPath" FROM project_file WHERE "projectId" = $2 AND "deletedAt" IS NULL`, [copyId, projectId])
        await client.query(`INSERT INTO project_specification ("projectId", specification)
          SELECT $1, specification FROM project_specification WHERE "projectId" = $2`, [copyId, projectId])
      })
      return owned(pool, userId, copyId)
    },
    async archive(userId: string, projectId: string) {
      const existing = await manageable(pool, userId, projectId)
      if (existing.status !== 'active') throw new ProjectLifecycleError('This project cannot be archived.')
      return row<Project>(pool, `UPDATE project SET status = 'archived', "archivedAt" = now(), "deletedAt" = NULL, "updatedAt" = now() WHERE id = $1 AND "userId" = $2 RETURNING *`, [projectId, userId])
    },
    async restore(userId: string, projectId: string) {
      const existing = await manageable(pool, userId, projectId)
      if (existing.status === 'active') throw new ProjectLifecycleError('This project cannot be restored.')
      return row<Project>(pool, `UPDATE project SET status = 'active', "archivedAt" = NULL, "deletedAt" = NULL, "updatedAt" = now() WHERE id = $1 AND "userId" = $2 RETURNING *`, [projectId, userId])
    },
    async softDelete(userId: string, projectId: string) {
      const existing = await manageable(pool, userId, projectId)
      if (existing.status === 'trashed') throw new ProjectLifecycleError('This project is already in trash.')
      return row<Project>(pool, `UPDATE project SET status = 'trashed', "deletedAt" = now(), "updatedAt" = now() WHERE id = $1 AND "userId" = $2 RETURNING *`, [projectId, userId])
    },
    async permanentlyDelete(userId: string, projectId: string) {
      const existing = await manageable(pool, userId, projectId)
      if (existing.status !== 'trashed') throw new ProjectLifecycleError('Only trashed projects can be permanently deleted.')
      await pool.query(`DELETE FROM project WHERE id = $1 AND "userId" = $2 AND status = 'trashed'`, [projectId, userId])
    },
    async getRuntime(userId: string, projectId: string) {
      await owned(pool,userId,projectId)
      return (await row<ProjectRuntime>(pool, 'SELECT * FROM project_runtime WHERE "projectId"=$1 LIMIT 1', [projectId])) ?? null
    },
    async listFiles(userId: string, projectId: string, options: { includeTrashed?: boolean } = {}) {
      await owned(pool,userId,projectId)
      return rows<ProjectFile>(pool, `SELECT * FROM project_file WHERE "projectId"=$1${options.includeTrashed ? '' : ' AND "deletedAt" IS NULL'} ORDER BY path`, [projectId])
    },
    async getFile(userId: string, projectId: string, fileId: string, options: { includeTrashed?: boolean } = {}) { return (await findFile(pool, userId, projectId, fileId, options.includeTrashed)) ?? null },
    async getFileByPath(userId: string, projectId: string, path: string, options: { includeTrashed?: boolean } = {}) {
      const safePath = validatePath(path)
      await owned(pool,userId,projectId)
      return (await row<ProjectFile>(pool, `SELECT * FROM project_file WHERE "projectId"=$1 AND path=$2${options.includeTrashed ? '' : ' AND "deletedAt" IS NULL'} LIMIT 1`, [projectId,safePath])) ?? null
    },
    async createCheckpoint(userId: string, projectId: string, label: string) {
      await writable(pool, userId, projectId)
      const files = await rows<{ path:string; content:string; encoding:'utf-8'|'utf-16le' }>(pool, 'SELECT path, content, encoding FROM project_file WHERE "projectId" = $1 AND "deletedAt" IS NULL ORDER BY path', [projectId])
      const runtime = await row<Record<string, unknown>>(pool, 'SELECT runtime, framework, "buildTool", "entryPath", metadata FROM project_runtime WHERE "projectId" = $1', [projectId])
      const specification = await row<{ specification: unknown }>(pool, 'SELECT specification FROM project_specification WHERE "projectId" = $1', [projectId])
      if (!runtime || !specification) throw new ProjectLifecycleError('Project workspace is incomplete.')
      const checkpointId = id()
      const checkpointLabel = normalizedCheckpointLabel(label)
      const created = await row<{ createdAt:Date }>(pool, 'INSERT INTO project_checkpoint (id, "projectId", label, files, runtime, specification) VALUES ($1, $2, $3, $4, $5, $6) RETURNING "createdAt"', [checkpointId, projectId, checkpointLabel, files, runtime, specification.specification])
      return { id: checkpointId, projectId, label: checkpointLabel, fileCount: files.length, createdAt: created?.createdAt ?? new Date() }
    },
    async applyFileBundle(userId: string, projectId: string, inputs: ProjectFileInput[], expected?:{path:string;updatedAt:Date}) {
      return postgresTransaction(async client => {
        await writable(client,userId,projectId)
        if (!Array.isArray(inputs)||inputs.length===0||inputs.length>100) throw new ProjectLifecycleError('Generated bundle must contain between 1 and 100 files.')
        const files=inputs.map(validateFileInput)
        if(expected){const current=await row<{updatedAt:Date}>(client,'SELECT "updatedAt" FROM project_file WHERE "projectId"=$1 AND path=$2 AND "deletedAt" IS NULL FOR UPDATE',[projectId,validatePath(expected.path)]);if(!current||current.updatedAt.getTime()!==expected.updatedAt.getTime())throw new ProjectLifecycleError('This file changed elsewhere. Reload or resolve the conflict before saving.')}
        if(new Set(files.map(file=>file.path)).size!==files.length) throw new ProjectLifecycleError('Generated bundle contains duplicate file paths.')
        const replaced=files.map(file=>file.path)
        const current=await row<{total:string}>(client,'SELECT COALESCE(SUM(size),0)::text total FROM project_file WHERE "projectId"=$1 AND "deletedAt" IS NULL AND NOT(path=ANY($2::text[]))',[projectId,replaced])
        if(Number(current?.total??0)+files.reduce((total,file)=>total+file.bytes,0)>MAX_PROJECT_BYTES) throw new ProjectLifecycleError('Project size limit exceeded.')
        const output:ProjectFile[]=[]
        for(const file of files){const saved=await row<ProjectFile>(client,`INSERT INTO project_file (id,"projectId",path,content,encoding,size) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("projectId",path) WHERE "deletedAt" IS NULL DO UPDATE SET content=EXCLUDED.content,encoding=EXCLUDED.encoding,size=EXCLUDED.size,"updatedAt"=now() RETURNING *`,[id(),projectId,file.path,file.content,file.encoding,file.bytes]);if(saved)output.push(saved)}
        await touch(client,projectId)
        return output
      })
    },
    async listCheckpoints(userId: string, projectId: string) {
      await owned(pool, userId, projectId)
      const checkpoints = await rows<{ id:string; projectId:string; label:string; fileCount:number; createdAt:Date }>(pool, 'SELECT id, "projectId", label, jsonb_array_length(files)::int AS "fileCount", "createdAt" FROM project_checkpoint WHERE "projectId" = $1 ORDER BY "createdAt" DESC', [projectId])
      return checkpoints
    },
    async restoreCheckpoint(userId: string, projectId: string, checkpointId: string) {
      await postgresTransaction(async client => {
        await writable(client, userId, projectId)
        const checkpoint = await row<{ files:ProjectFileInput[]; runtime:{ runtime:string; framework:string; buildTool:string|null; entryPath:string; metadata:Record<string,string> }; specification:unknown }>(client, 'SELECT files,runtime,specification FROM project_checkpoint WHERE id=$1 AND "projectId"=$2 FOR UPDATE', [checkpointId, projectId])
        if (!checkpoint) throw new ProjectLifecycleError('Checkpoint not found.')
        const files = checkpoint.files.map(validateFileInput)
        if (files.reduce((total, file) => total + file.bytes, 0) > MAX_PROJECT_BYTES) throw new ProjectLifecycleError('Checkpoint exceeds the project size limit.')
        const specification = parseProjectSpecification(checkpoint.specification)
        await client.query('DELETE FROM project_file WHERE "projectId" = $1', [projectId])
        for (const file of files) await client.query('INSERT INTO project_file (id, "projectId", path, content, encoding, size) VALUES ($1, $2, $3, $4, $5, $6)', [id(), projectId, file.path, file.content, file.encoding, file.bytes])
        await client.query('UPDATE project_runtime SET runtime = $1, framework = $2, "buildTool" = $3, "entryPath" = $4, metadata = $5, "updatedAt" = now() WHERE "projectId" = $6', [checkpoint.runtime.runtime, checkpoint.runtime.framework, checkpoint.runtime.buildTool, checkpoint.runtime.entryPath, checkpoint.runtime.metadata, projectId])
        await client.query('UPDATE project_specification SET specification = $1, "updatedAt" = now() WHERE "projectId" = $2', [specification, projectId])
        await touch(client, projectId)
      })
    },
    async createFile(userId: string, projectId: string, input: ProjectFileInput) {
      const file = validateFileInput(input)
      return postgresTransaction(async client => {
        await writable(client, userId, projectId); await availablePath(client, projectId, file.path); await capacity(client, projectId, file.bytes)
        const created = await row<ProjectFile>(client, 'INSERT INTO project_file (id, "projectId", path, content, encoding, size) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [id(), projectId, file.path, file.content, file.encoding, file.bytes])
        await touch(client, projectId); return created
      })
    },
    async renameFile(userId: string, projectId: string, fileId: string, path: string) {
      const safePath = validatePath(path)
      return postgresTransaction(async client => {
        await writable(client, userId, projectId); const existing = await findFile(client, userId, projectId, fileId)
        if (!existing) throw new ProjectLifecycleError('File not found.')
        await availablePath(client, projectId, safePath, fileId)
        const updated = await row<ProjectFile>(client, 'UPDATE project_file SET path = $1, "updatedAt" = now() WHERE id = $2 AND "projectId" = $3 RETURNING *', [safePath, fileId, projectId])
        await client.query('UPDATE project_runtime SET "entryPath" = $1, "updatedAt" = now() WHERE "projectId" = $2 AND "entryPath" = $3', [safePath, projectId, existing.path])
        await touch(client, projectId); return updated
      })
    },
    async updateFile(userId: string, projectId: string, fileId: string, update: ProjectFileUpdate) {
      return postgresTransaction(async client => {
        await writable(client, userId, projectId); const existing = await findFile(client, userId, projectId, fileId)
        if (!existing) throw new ProjectLifecycleError('File not found.')
        if (update.expectedUpdatedAt && existing.updatedAt.getTime() !== update.expectedUpdatedAt.getTime()) throw new ProjectLifecycleError('This file changed elsewhere. Reload it before saving.')
        const content = validateFileInput({ path: existing.path, content: update.content, encoding: update.encoding ?? existing.encoding as FileEncoding })
        await capacity(client, projectId, content.bytes, existing.size)
        const updated = await row<ProjectFile>(client, 'UPDATE project_file SET content = $1, encoding = $2, size = $3, "updatedAt" = now() WHERE id = $4 AND "projectId" = $5 RETURNING *', [content.content, content.encoding, content.bytes, fileId, projectId])
        await touch(client, projectId, updated.updatedAt); return updated
      })
    },
    async trashFile(userId: string, projectId: string, fileId: string) {
      return postgresTransaction(async client => {
        await writable(client, userId, projectId); const existing = await findFile(client, userId, projectId, fileId)
        if (!existing) throw new ProjectLifecycleError('File not found.')
        const updated = await row<ProjectFile>(client, 'UPDATE project_file SET "deletedAt" = now(), "updatedAt" = now() WHERE id = $1 AND "projectId" = $2 RETURNING *', [fileId, projectId])
        await touch(client, projectId); return updated
      })
    },
    async restoreFile(userId: string, projectId: string, fileId: string) {
      return postgresTransaction(async client => {
        await writable(client, userId, projectId); const existing = await findFile(client, userId, projectId, fileId, true)
        if (!existing || existing.deletedAt === null) throw new ProjectLifecycleError('Trashed file not found.')
        await availablePath(client, projectId, existing.path); await capacity(client, projectId, existing.size)
        const updated = await row<ProjectFile>(client, 'UPDATE project_file SET "deletedAt" = NULL, "updatedAt" = now() WHERE id = $1 AND "projectId" = $2 RETURNING *', [fileId, projectId])
        await touch(client, projectId); return updated
      })
    },
    async permanentlyDeleteFile(userId: string, projectId: string, fileId: string) {
      await postgresTransaction(async client => {
        await writable(client, userId, projectId); const existing = await findFile(client, userId, projectId, fileId, true)
        if (!existing || existing.deletedAt === null) throw new ProjectLifecycleError('Only trashed files can be permanently deleted.')
        await client.query('DELETE FROM project_file WHERE id = $1 AND "projectId" = $2 AND "deletedAt" IS NOT NULL', [fileId, projectId]); await touch(client, projectId)
      })
    },
    getSettings,
    async updateSettings(userId: string, input: unknown) {
      const current = await getSettings(userId); const values = settingsValues(input)
      const updated = await row<UserSettings>(pool, `UPDATE user_settings SET theme = $1, "editorFontSize" = $2, "autosaveInterval" = $3, "defaultDevice" = $4, "updatedAt" = now() WHERE "userId" = $5 RETURNING *`, [values.theme ?? current.theme, values.editorFontSize ?? current.editorFontSize, values.autosaveInterval ?? current.autosaveInterval, values.defaultDevice ?? current.defaultDevice, userId])
      return updated
    },
  }
}

export type PostgresProjectService = ReturnType<typeof createPostgresProjectService>
