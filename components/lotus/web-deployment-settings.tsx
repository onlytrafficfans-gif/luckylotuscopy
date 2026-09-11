'use client'

import { useEffect, useState, useTransition } from 'react'
import { ExternalLink, RefreshCw, Rocket, ShieldCheck } from 'lucide-react'
import { createVercelPreviewAction, listWebDeploymentsAction, promoteVercelDeploymentAction, refreshVercelDeploymentAction } from '@/app/actions/projects'
import { IntegrationSettings } from '@/components/lotus/integration-settings'
import type { DeploymentRecord } from '@/lib/deployment-records'

export function WebDeploymentSettings({ projectId }: { projectId: string }) {
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    listWebDeploymentsAction(projectId)
      .then(value => { if (active) setDeployments(value) })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Deployment history could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  function createPreview() {
    setMessage(null)
    startTransition(async () => {
      const result = await createVercelPreviewAction(projectId)
      if (!result.ok) { setMessage(result.error); return }
      setDeployments(current => [result.deployment, ...current])
      setMessage('Preview deployment started. Refresh its status before promoting it.')
    })
  }

  function refresh(record: DeploymentRecord) {
    setMessage(null)
    startTransition(async () => {
      const result = await refreshVercelDeploymentAction(projectId, record.id)
      if (!result.ok) { setMessage(result.error); return }
      setDeployments(current => current.map(item => item.id === record.id ? result.deployment : item))
    })
  }

  function promote(record: DeploymentRecord) {
    if (!window.confirm(`Promote ${record.url ?? record.name} to production? This changes live traffic.`)) return
    setMessage(null)
    startTransition(async () => {
      const result = await promoteVercelDeploymentAction(projectId, record.id)
      if (!result.ok) { setMessage(result.error); return }
      setDeployments(current => current.map(item => item.id === record.id ? result.deployment : item))
      setMessage('Vercel accepted the production promotion.')
    })
  }

  return <div className="mt-7 grid gap-5">
    <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Web deployment</h2><p className="mt-1 text-sm text-[#806b60] dark:text-[#bba99f]">Ship a real Vercel Preview first, inspect it, then explicitly promote the same project to production.</p></div><button type="button" onClick={createPreview} disabled={pending || loading} className="inline-flex items-center gap-2 rounded-xl bg-[#e98b66] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Rocket size={16}/>{pending ? 'Working…' : 'Deploy preview'}</button></div>
      {message && <p role="status" className="mt-4 rounded-xl border border-[#eadfd8] bg-[#fff8f3] px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">{message}</p>}
      <div className="mt-5"><IntegrationSettings providerIds={['vercel']}/></div>
    </section>

    <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2"><ShieldCheck size={19} className="text-emerald-600"/><h2 className="text-lg font-semibold">Deployment history</h2></div>
      {loading ? <p className="mt-4 text-sm text-[#806b60]">Loading deployments…</p> : deployments.length === 0 ? <p className="mt-4 text-sm text-[#806b60]">No web deployment has been created for this project.</p> : <div className="mt-4 space-y-3">{deployments.map(record => <article key={record.id} className="rounded-xl border border-[#eadfd8] p-4 dark:border-white/10"><div className="flex flex-wrap items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${record.status === 'ready' ? 'bg-emerald-500' : record.status === 'error' || record.status === 'canceled' ? 'bg-red-500' : 'bg-amber-500'}`}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{record.url ?? record.name}</p><p className="mt-0.5 text-xs capitalize text-[#806b60]">{record.target} · {record.status}</p></div>{record.url && <a href={record.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold">Open <ExternalLink size={13}/></a>}<button type="button" onClick={() => refresh(record)} disabled={pending} aria-label={`Refresh ${record.name}`} className="rounded-lg border p-2 disabled:opacity-50"><RefreshCw size={14}/></button>{record.status === 'ready' && record.target === 'preview' && <button type="button" onClick={() => promote(record)} disabled={pending} className="rounded-lg bg-[#332721] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Promote to production</button>}</div>{record.error && <p className="mt-3 text-xs text-red-600">{record.error}</p>}</article>)}</div>}
    </section>
  </div>
}
