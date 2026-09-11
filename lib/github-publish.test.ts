import { describe, expect, it, vi } from 'vitest'
import { publishGitHubRepository } from '@/lib/github-publish'

describe('GitHub repository publishing', () => {
  it('publishes a complete project as one root commit', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ full_name: 'lotus/my-app', html_url: 'https://github.com/lotus/my-app', default_branch: 'main' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'tree-sha' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'commit-sha' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ref: 'refs/heads/main' }), { status: 201 }))
    const result = await publishGitHubRepository('secret-token', { name: 'My App', description: 'Built with Lucky Lotus', private: true, files: [{ path: 'index.html', content: '<h1>Hello</h1>' }] }, fetcher)
    expect(result).toEqual({ repository: 'lotus/my-app', url: 'https://github.com/lotus/my-app', branch: 'main', commitSha: 'commit-sha' })
    const treeBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body))
    expect(treeBody.tree).toEqual([{ path: 'index.html', mode: '100644', type: 'blob', content: '<h1>Hello</h1>' }])
    expect(fetcher.mock.calls[3][0]).toBe('https://api.github.com/repos/lotus/my-app/git/refs')
  })

  it('does not expose the token when GitHub rejects the request', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Repository already exists' }), { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Repository already exists' }), { status: 422 }))
    await expect(publishGitHubRepository('secret-token', { name: 'App', description: '', private: true, files: [{ path: 'index.html', content: '' }] }, fetcher)).rejects.toThrow('Repository already exists')
    await expect(publishGitHubRepository('secret-token', { name: 'App', description: '', private: true, files: [{ path: 'index.html', content: '' }] }, fetcher)).rejects.not.toThrow('secret-token')
  })
})
