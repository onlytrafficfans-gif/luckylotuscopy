import type { MobileDeploymentConfig } from '@/lib/mobile-deployment-schema'

export type NativePackageFile = { path: string; content: string }

function assertSafeArchivePath(path: string) {
  const parts = path.split('/')
  if (!path || path.length > 240 || path.startsWith('/') || path.includes('\\') || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error('The native package contains an unsafe path.')
  }
}

export function prepareNativePackage(files: NativePackageFile[], config: MobileDeploymentConfig) {
  files.forEach(file => assertSafeArchivePath(file.path))
  const appConfig = files.find(file => file.path === 'app.json')
  const easConfig = files.find(file => file.path === 'eas.json')
  const entry = files.find(file => file.path === 'index.js')
  if (!appConfig || !easConfig || !entry) throw new Error('This project is not an Expo native app.')

  const result = files.map(file => ({ ...file }))
  const outputConfig = result.find(file => file.path === 'app.json')!
  const parsed = JSON.parse(outputConfig.content) as { expo?: { ios?: Record<string, unknown>; android?: Record<string, unknown> } }
  if (!parsed.expo) throw new Error('The Expo app configuration is invalid.')
  parsed.expo.ios ??= {}
  parsed.expo.android ??= {}
  if (config.appleBundleId) parsed.expo.ios.bundleIdentifier = config.appleBundleId
  if (config.googlePackageName) parsed.expo.android.package = config.googlePackageName
  outputConfig.content = JSON.stringify(parsed, null, 2) + '\n'
  return result
}
