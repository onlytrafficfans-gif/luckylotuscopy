import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVercelClient, prepareVercelSource } from '@/lib/vercel-deployment'

describe('Vercel deployment source', () => {
  it('adds a real Vite build contract to React projects', () => {
    const source = prepareVercelSource('My App', 'react', [{ path: 'index.html', content: '<div id="root"></div>' }, { path: 'src/main.jsx', content: 'export {}' }])
    expect(JSON.parse(source.files.find(file => file.path === 'package.json')!.content)).toMatchObject({ scripts: { build: 'vite build' }, dependencies: { react: expect.any(String), 'react-dom': expect.any(String) } })
    expect(source.projectSettings).toMatchObject({ framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist' })
  })

  it('keeps static projects dependency free', () => {
    const source = prepareVercelSource('Landing', 'static', [{ path: 'index.html', content: '<h1>Hello</h1>' }])
    expect(source.files).toEqual([{ path: 'index.html', content: '<h1>Hello</h1>' }])
    expect(source.projectSettings).toMatchObject({ framework: null, outputDirectory: '.' })
  })

  it('rejects native projects from web deployment', () => {
    expect(() => prepareVercelSource('Native', 'expo', [{ path: 'App.jsx', content: '' }])).toThrow(/Expo/)
  })
})

describe('Vercel deployment client', () => {
  const fetcher = vi.fn<typeof fetch>()
  beforeEach(() => fetcher.mockReset())

  it('creates previews with inline base64 files and without a production target', async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ id: 'dpl_123', name: 'my-app', projectId: 'prj_123', url: 'my-app-abc.vercel.app', readyState: 'QUEUED' }), { status: 200 }))
    const client = createVercelClient('secret-token', fetcher)
    const result = await client.createPreview({ name: 'My App', framework: 'static', files: [{ path: 'index.html', content: '<h1>Hello</h1>' }] })
    const [, init] = fetcher.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.target).toBeUndefined()
    expect(body.files).toEqual([{ file: 'index.html', data: Buffer.from('<h1>Hello</h1>').toString('base64'), encoding: 'base64' }])
    expect(result).toMatchObject({ providerDeploymentId: 'dpl_123', providerProjectId: 'prj_123', status: 'queued', url: 'https://my-app-abc.vercel.app' })
  })

  it('polls deployment state and promotes only ready previews', async () => {
    fetcher
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'dpl_123', name: 'my-app', projectId: 'prj_123', url: 'my-app.vercel.app', readyState: 'READY' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    const client = createVercelClient('secret-token', fetcher)
    const state = await client.getDeployment('dpl_123')
    await client.promote({ providerProjectId: state.providerProjectId, providerDeploymentId: state.providerDeploymentId })
    expect(fetcher.mock.calls[1][0]).toBe('https://api.vercel.com/v10/projects/prj_123/promote/dpl_123')
    expect(fetcher.mock.calls[1][1]?.method).toBe('POST')
  })

  it('returns safe provider errors without exposing credentials', async () => {
    fetcher
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Invalid request' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Invalid request' } }), { status: 400 }))
    const client = createVercelClient('super-secret-token', fetcher)
    await expect(client.createPreview({ name: 'App', framework: 'static', files: [{ path: 'index.html', content: '' }] })).rejects.toThrow('Invalid request')
    await expect(client.createPreview({ name: 'App', framework: 'static', files: [{ path: 'index.html', content: '' }] })).rejects.not.toThrow('super-secret-token')
  })
})
