import { describe, expect, it } from 'vitest'
import { createProjectInputSchema, frameworkProjectSetup } from '@/lib/project-framework'

describe('project framework choices', () => {
  it('defaults safely to static HTML', () => {
    expect(createProjectInputSchema.parse({})).toEqual({ name: 'Untitled project', framework: 'static' })
    expect(frameworkProjectSetup('static')).toMatchObject({ runtime: 'static', framework: 'static', entryPath: 'index.html', targets: ['web'] })
  })

  it.each([
    ['react', 'react', 'vite'],
    ['nextjs', 'react', 'next'],
    ['expo', 'react', 'expo'],
  ] as const)('uses the React preview adapter for %s', (framework, runtime, buildTool) => {
    expect(frameworkProjectSetup(framework)).toMatchObject({ runtime, framework, buildTool, metadata: { generationEntry: 'src/App.jsx', previewAdapter: 'react' } })
  })

  it('creates an EAS-ready native package for Expo projects', () => {
    const setup = frameworkProjectSetup('expo')
    const files = new Map(setup.files.map(file => [file.path, file.content]))

    expect(JSON.parse(files.get('package.json')!)).toMatchObject({
      main: 'index.js',
      dependencies: { expo: '^57.0.17', react: '19.2.0', 'react-native': '0.86.3' },
    })
    expect(JSON.parse(files.get('eas.json')!)).toMatchObject({
      build: { production: { android: { buildType: 'app-bundle' } } },
    })
    expect(files.get('index.js')).toContain("./native/App")
    expect(files.get('native/App.jsx')).toContain("from 'react-native'")
    expect(files.get('src/App.jsx')).toContain('Start building')
  })
})
