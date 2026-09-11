import { z } from 'zod'
import type { ProjectFramework } from '@/lib/project-framework'

const API_ROOT = 'https://api.vercel.com'
const MAX_RESPONSE_BYTES = 262_144

export type DeploymentStatus = 'queued' | 'building' | 'ready' | 'error' | 'canceled'
export type DeploymentFile = { path: string; content: string }

export interface VercelDeploymentState {
  providerDeploymentId: string
  providerProjectId: string
  name: string
  status: DeploymentStatus
  url: string | null
  error: string | null
}

const deploymentResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  projectId: z.string().min(1),
  url: z.string().min(1).optional(),
  readyState: z.enum(['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR', 'CANCELED']),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),
})

function projectSlug(name: string) {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return slug || 'lucky-lotus-app'
}

function packageFile(name: string) {
  return JSON.stringify({
    name: projectSlug(name), version: '1.0.0', private: true, type: 'module',
    scripts: { build: 'vite build' },
    dependencies: { '@vitejs/plugin-react': '^5.0.0', vite: '^7.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDependencies: {},
  }, null, 2) + '\n'
}

export function prepareVercelSource(name: string, framework: ProjectFramework, files: DeploymentFile[]) {
  if (framework === 'expo') throw new Error('Expo projects use the native build and store workflow, not Vercel web deployment.')
  if (!files.some(file => file.path === 'index.html')) throw new Error('Web deployment requires an index.html entry file.')
  if (framework === 'static') return { files, projectSettings: { framework: null, outputDirectory: '.' } }
  const deployFiles = files.some(file => file.path === 'package.json') ? files : [...files, { path: 'package.json', content: packageFile(name) }]
  return { files: deployFiles, projectSettings: { framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist' } }
}

function statusOf(value: z.infer<typeof deploymentResponseSchema>['readyState']): DeploymentStatus {
  if (value === 'READY') return 'ready'
  if (value === 'ERROR') return 'error'
  if (value === 'CANCELED') return 'canceled'
  if (value === 'QUEUED') return 'queued'
  return 'building'
}

function deploymentState(value: unknown): VercelDeploymentState {
  const parsed = deploymentResponseSchema.parse(value)
  return {
    providerDeploymentId: parsed.id,
    providerProjectId: parsed.projectId,
    name: parsed.name,
    status: statusOf(parsed.readyState),
    url: parsed.url ? `https://${parsed.url.replace(/^https?:\/\//, '')}` : null,
    error: parsed.errorMessage ?? parsed.errorCode ?? null,
  }
}

async function jsonResponse(response: Response) {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_RESPONSE_BYTES) throw new Error('Vercel returned an oversized response.')
  const text = await response.text()
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('Vercel returned an oversized response.')
  let value: unknown
  try { value = text ? JSON.parse(text) : {} } catch { throw new Error('Vercel returned an invalid response.') }
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ message: z.string().max(500) }).optional(), message: z.string().max(500).optional() }).safeParse(value)
    throw new Error(parsed.success ? parsed.data.error?.message ?? parsed.data.message ?? 'Vercel rejected the request.' : 'Vercel rejected the request.')
  }
  return value
}

export function createVercelClient(token: string, fetcher: typeof fetch = fetch) {
  if (token.trim().length < 8) throw new Error('A valid Vercel access token is required.')
  async function request(path: string, init: RequestInit) {
    const response = await fetcher(`${API_ROOT}${path}`, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    })
    return jsonResponse(response)
  }

  return {
    async createPreview(input: { name: string; framework: ProjectFramework; files: DeploymentFile[] }) {
      const source = prepareVercelSource(input.name, input.framework, input.files)
      return deploymentState(await request('/v13/deployments?skipAutoDetectionConfirmation=1', {
        method: 'POST',
        body: JSON.stringify({
          name: projectSlug(input.name),
          files: source.files.map(file => ({ file: file.path, data: Buffer.from(file.content).toString('base64'), encoding: 'base64' })),
          projectSettings: source.projectSettings,
        }),
      }))
    },
    async getDeployment(providerDeploymentId: string) {
      return deploymentState(await request(`/v13/deployments/${encodeURIComponent(providerDeploymentId)}`, { method: 'GET' }))
    },
    async promote(input: Pick<VercelDeploymentState, 'providerProjectId' | 'providerDeploymentId'>) {
      await request(`/v10/projects/${encodeURIComponent(input.providerProjectId)}/promote/${encodeURIComponent(input.providerDeploymentId)}`, { method: 'POST', body: '{}' })
      return { ok: true as const }
    },
  }
}
