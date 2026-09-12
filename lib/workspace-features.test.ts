import { describe, expect, it } from 'vitest'
import { assetUploadSchema, canManageProject, canWriteProject, normalizeAnalyticsEvent } from '@/lib/workspace-features'

describe('workspace feature boundaries', () => {
  it('enforces owner, editor, and viewer permissions', () => {
    expect(canManageProject('owner')).toBe(true)
    expect(canManageProject('editor')).toBe(false)
    expect(canWriteProject('editor')).toBe(true)
    expect(canWriteProject('viewer')).toBe(false)
  })

  it('accepts safe assets and rejects oversized or executable uploads', () => {
    expect(assetUploadSchema.parse({ projectId: crypto.randomUUID(), name: 'hero.png', mimeType: 'image/png', size: 1024 }).name).toBe('hero.png')
    expect(() => assetUploadSchema.parse({ projectId: crypto.randomUUID(), name: 'bad.exe', mimeType: 'application/x-msdownload', size: 1024 })).toThrow()
    expect(() => assetUploadSchema.parse({ projectId: crypto.randomUUID(), name: 'huge.png', mimeType: 'image/png', size: 6 * 1024 * 1024 })).toThrow()
  })

  it('keeps analytics event properties small and free of dangerous keys', () => {
    expect(normalizeAnalyticsEvent({ name: 'builder.generate', properties: { device: 'desktop', token: 'secret', nested: { ignored: true } } })).toEqual({
      name: 'builder.generate',
      properties: { device: 'desktop' },
    })
    expect(() => normalizeAnalyticsEvent({ name: '<script>', properties: {} })).toThrow()
  })
})
