'use client'

import { useEffect, useState, useTransition } from 'react'
import { Apple, ExternalLink, PackageCheck, Play } from 'lucide-react'
import { exportNativePackageAction, getMobileDeploymentConfigAction, saveMobileDeploymentConfigAction } from '@/app/actions/projects'
import { IntegrationSettings } from '@/components/lotus/integration-settings'
import { emptyMobileDeploymentConfig, type MobileDeploymentConfig } from '@/lib/mobile-deployment-schema'

export function MobileDeploymentSettings({ projectId }: { projectId: string }) {
  const [config, setConfig] = useState(() => emptyMobileDeploymentConfig(projectId))
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getMobileDeploymentConfigAction(projectId)
      .then(value => { if (active) setConfig(value) })
      .catch(() => { if (active) setMessage('Mobile deployment settings could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  function field<K extends keyof MobileDeploymentConfig>(key: K, value: MobileDeploymentConfig[K]) {
    setConfig(current => ({ ...current, [key]: value }))
  }

  function save() {
    setMessage(null)
    startTransition(async () => {
      const result = await saveMobileDeploymentConfigAction(config)
      if (!result.ok) { setMessage(result.error); return }
      setConfig(result.config)
      setMessage('Mobile deployment configuration saved.')
    })
  }

  function downloadNativePackage() {
    setMessage(null)
    startTransition(async () => {
      try {
        const [{ files, name }, { strToU8, zipSync }] = await Promise.all([exportNativePackageAction(projectId), import('fflate')])
        const archive = zipSync(Object.fromEntries(files.map(file => [file.path, strToU8(file.content)])), { level: 6 })
        const blob = new Blob([archive.buffer as ArrayBuffer], { type: 'application/zip' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lucky-lotus-app'}-native.zip`
        anchor.click()
        URL.revokeObjectURL(url)
        setMessage('EAS-ready iOS and Android source package downloaded.')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'The native package could not be created.')
      }
    })
  }

  return <div className="mt-7 grid gap-5">
    <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 dark:border-white/10 dark:bg-white/5">
      <h2 className="text-lg font-semibold">Store accounts</h2>
      <p className="mt-1 text-sm text-[#806b60] dark:text-[#bba99f]">Credentials are verified with Apple or Google and encrypted before storage.</p>
      <div className="mt-4"><IntegrationSettings providerIds={['appstore', 'googleplay']}/></div>
    </section>

    <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 dark:border-white/10 dark:bg-white/5">
      <h2 className="text-lg font-semibold">Store application identifiers</h2>
      <p className="mt-1 text-sm text-[#806b60] dark:text-[#bba99f]">These permanent identifiers must match the native build and the existing store listings.</p>
      {message && <div role="status" className={`mt-4 rounded-xl border px-3 py-2 text-sm ${message.includes('saved') ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{message}</div>}
      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-[#eadfd8] p-4 dark:border-white/10"><div className="flex items-center gap-2 font-semibold"><Apple size={18}/>Apple</div><label className="mt-4 grid gap-1.5 text-sm font-medium">Bundle ID<input className="input" value={config.appleBundleId} onChange={event => field('appleBundleId', event.target.value)} placeholder="com.company.app"/></label><label className="mt-3 grid gap-1.5 text-sm font-medium">App Store app ID<input className="input" inputMode="numeric" value={config.appleAppId} onChange={event => field('appleAppId', event.target.value)} placeholder="1234567890"/></label><a href="https://appstoreconnect.apple.com/apps" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#b46743]">Open App Store Connect <ExternalLink size={13}/></a></div>
        <div className="rounded-xl border border-[#eadfd8] p-4 dark:border-white/10"><div className="flex items-center gap-2 font-semibold"><Play size={18}/>Google Play</div><label className="mt-4 grid gap-1.5 text-sm font-medium">Package name<input className="input" value={config.googlePackageName} onChange={event => field('googlePackageName', event.target.value)} placeholder="com.company.app"/></label><label className="mt-3 grid gap-1.5 text-sm font-medium">Release track<select className="input" value={config.googleTrack} onChange={event => field('googleTrack', event.target.value as MobileDeploymentConfig['googleTrack'])}><option value="internal">Internal testing</option><option value="alpha">Closed testing</option><option value="beta">Open testing</option><option value="production">Production</option></select></label><a href="https://play.google.com/console/" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#b46743]">Open Play Console <ExternalLink size={13}/></a></div>
      </div>
      <button type="button" disabled={pending || loading} onClick={save} className="mt-5 rounded-xl bg-[#e98b66] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save mobile configuration'}</button>
    </section>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100"><div className="flex items-start gap-3"><PackageCheck className="mt-0.5 shrink-0" size={20}/><div className="flex-1"><h2 className="font-semibold">Native package ready</h2><p className="mt-1 text-sm leading-6">Expo projects export as an Expo SDK 57 package with EAS development, preview, and production profiles. EAS creates the signed <code>.ipa</code> and <code>.aab</code>; Apple and Google credentials are still required before their stores accept a build.</p><button type="button" disabled={pending} onClick={downloadNativePackage} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Preparing…' : 'Download native source (.zip)'}</button></div></div></section>
  </div>
}
