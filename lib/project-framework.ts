import { z } from 'zod'

export const projectFrameworkSchema = z.enum(['static', 'react', 'nextjs', 'expo'])
export type ProjectFramework = z.infer<typeof projectFrameworkSchema>

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(100).default('Untitled project'),
  framework: projectFrameworkSchema.default('static'),
})

export const PROJECT_FRAMEWORKS: Array<{ id: ProjectFramework; label: string; description: string; platforms: string }> = [
  { id: 'static', label: 'Static HTML', description: 'HTML, CSS, and JavaScript with the fastest preview.', platforms: 'Web' },
  { id: 'react', label: 'React', description: 'Component-based web apps with a bundled live preview.', platforms: 'Web' },
  { id: 'nextjs', label: 'Next.js', description: 'Next.js project identity with a React preview adapter.', platforms: 'Web + API' },
  { id: 'expo', label: 'Expo', description: 'React Native project identity for iOS and Android apps.', platforms: 'iOS + Android' },
]

type StarterFile = { path: string; content: string }

const staticFiles: StarterFile[] = [
  { path: 'index.html', content: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <title>Lucky Lotus app</title>\n    <link rel="stylesheet" href="styles.css">\n  </head>\n  <body>\n    <main><h1>Start building</h1></main>\n    <script src="script.js"></script>\n  </body>\n</html>\n' },
  { path: 'styles.css', content: ':root { font-family: system-ui, sans-serif; }\nbody { margin: 0; padding: 2rem; }\n' },
  { path: 'script.js', content: 'console.info("Lucky Lotus starter ready")\n' },
]

const reactFiles: StarterFile[] = [
  { path: 'index.html', content: '<!doctype html>\n<html lang="en">\n  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Lucky Lotus app</title></head>\n  <body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>\n</html>\n' },
  { path: 'src/main.jsx', content: "import React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App.jsx'\nimport './styles.css'\n\ncreateRoot(document.getElementById('root')).render(<App />)\n" },
  { path: 'src/App.jsx', content: "export default function App() {\n  return <main className=\"app\"><h1>Start building</h1></main>\n}\n" },
  { path: 'src/styles.css', content: ':root { font-family: Inter, system-ui, sans-serif; }\n* { box-sizing: border-box; }\nbody { margin: 0; }\n.app { min-height: 100vh; display: grid; place-items: center; padding: 2rem; }\n' },
]

const expoFiles: StarterFile[] = [
  ...reactFiles,
  { path: 'package.json', content: JSON.stringify({
    name: 'lucky-lotus-app', version: '1.0.0', private: true, main: 'index.js',
    scripts: { start: 'expo start', android: 'expo start --android', ios: 'expo start --ios', doctor: 'expo-doctor', build: 'eas build --platform all --profile production' },
    dependencies: { expo: '^57.0.17', react: '19.2.0', 'react-native': '0.86.3' },
    devDependencies: { '@babel/core': '^7.28.0', 'expo-doctor': '^1.19.2' },
  }, null, 2) + '\n' },
  { path: 'app.json', content: JSON.stringify({ expo: {
    name: 'Lucky Lotus App', slug: 'lucky-lotus-app', version: '1.0.0', orientation: 'portrait', userInterfaceStyle: 'automatic',
    ios: { supportsTablet: true, bundleIdentifier: 'com.luckylotus.app' },
    android: { package: 'com.luckylotus.app' },
  } }, null, 2) + '\n' },
  { path: 'eas.json', content: JSON.stringify({
    cli: { version: '>= 16.0.0' },
    build: {
      development: { developmentClient: true, distribution: 'internal' },
      preview: { distribution: 'internal', android: { buildType: 'apk' } },
      production: { android: { buildType: 'app-bundle' } },
    },
    submit: { production: {} },
  }, null, 2) + '\n' },
  { path: 'index.js', content: "import { registerRootComponent } from 'expo'\nimport App from './native/App'\n\nregisterRootComponent(App)\n" },
  { path: 'native/App.jsx', content: "import { SafeAreaView, StyleSheet, Text, View } from 'react-native'\n\nexport default function App() {\n  return <SafeAreaView style={styles.safeArea}><View style={styles.container}><Text style={styles.title}>Start building</Text><Text style={styles.copy}>Your Lucky Lotus native app is EAS-ready.</Text></View></SafeAreaView>\n}\n\nconst styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: '#fff8f3' }, container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, title: { color: '#332721', fontSize: 30, fontWeight: '700' }, copy: { color: '#806b60', fontSize: 16, marginTop: 10, textAlign: 'center' } })\n" },
  { path: 'README.md', content: '# Lucky Lotus native app\n\nInstall dependencies with `npm install`, verify with `npx expo-doctor@latest`, then run `npx eas-cli@latest build --platform all --profile production`. Apple and Google signing credentials are required by EAS before store builds can complete.\n' },
]

export function frameworkProjectSetup(framework: ProjectFramework) {
  const isComponentProject = framework !== 'static'
  return {
    runtime: isComponentProject ? 'react' as const : 'static' as const,
    framework,
    buildTool: framework === 'static' ? null : framework === 'nextjs' ? 'next' : framework === 'expo' ? 'expo' : 'vite',
    entryPath: 'index.html',
    metadata: isComponentProject ? { generationEntry: 'src/App.jsx', previewAdapter: 'react' } : {},
    files: framework === 'expo' ? expoFiles : isComponentProject ? reactFiles : staticFiles,
    targets: framework === 'expo' ? ['ios', 'android'] as const : framework === 'nextjs' ? ['web', 'api'] as const : ['web'] as const,
  }
}
