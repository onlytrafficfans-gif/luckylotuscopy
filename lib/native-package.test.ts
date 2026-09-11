import { describe, expect, it } from 'vitest'
import { prepareNativePackage } from '@/lib/native-package'

describe('native package export', () => {
  it('applies saved store identifiers without changing the stored source', () => {
    const source = [
      { path: 'app.json', content: JSON.stringify({ expo: { name: 'App', ios: {}, android: {} } }) },
      { path: 'eas.json', content: '{}' },
      { path: 'index.js', content: "import './native/App'" },
    ]
    const result = prepareNativePackage(source, {
      projectId: 'a30007cf-d346-4760-882b-4d6e17766823',
      appleBundleId: 'com.lucky.ios', appleAppId: '', googlePackageName: 'com.lucky.android', googleTrack: 'internal',
    })
    const config = JSON.parse(result.find(file => file.path === 'app.json')!.content)
    expect(config.expo.ios.bundleIdentifier).toBe('com.lucky.ios')
    expect(config.expo.android.package).toBe('com.lucky.android')
    expect(source[0].content).not.toContain('com.lucky.ios')
  })

  it('rejects packages that are not Expo projects', () => {
    expect(() => prepareNativePackage([{ path: 'index.html', content: '' }], {
      projectId: 'a30007cf-d346-4760-882b-4d6e17766823',
      appleBundleId: '', appleAppId: '', googlePackageName: '', googleTrack: 'internal',
    })).toThrow('Expo')
  })

  it('rejects unsafe archive paths even if storage is corrupted', () => {
    expect(() => prepareNativePackage([
      { path: 'app.json', content: '{"expo":{}}' },
      { path: 'eas.json', content: '{}' },
      { path: 'index.js', content: '' },
      { path: '../escape.txt', content: 'unsafe' },
    ], {
      projectId: 'a30007cf-d346-4760-882b-4d6e17766823',
      appleBundleId: '', appleAppId: '', googlePackageName: '', googleTrack: 'internal',
    })).toThrow('unsafe path')
  })
})
