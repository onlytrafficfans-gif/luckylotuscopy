'use client'

import { useEffect, useState, useTransition } from 'react'
import { BarChart3, Download, FileUp, Trash2, Users } from 'lucide-react'
import { addProjectMemberAction, deleteProjectAssetAction, getWorkspaceFeaturesAction, removeProjectMemberAction, uploadProjectAssetAction } from '@/app/actions/workspace'

type WorkspaceData = Awaited<ReturnType<typeof getWorkspaceFeaturesAction>>

export function WorkspaceHub({projects}:{projects:Array<{id:string;name:string}>}) {
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [data,setData]=useState<WorkspaceData|null>(null)
  const [error,setError]=useState('')
  const [email,setEmail]=useState('')
  const [role,setRole]=useState<'editor'|'viewer'>('editor')
  const [pending,startTransition]=useTransition()

  function refresh(id=projectId) {
    if(!id){setData(null);return}
    startTransition(async()=>{try{setError('');setData(await getWorkspaceFeaturesAction(id))}catch(value){setError(value instanceof Error?value.message:'Workspace could not be loaded.')}})
  }
  useEffect(()=>{
    if(!projectId)return
    let active=true
    void getWorkspaceFeaturesAction(projectId).then(value=>{if(active){setData(value);setError('')}}).catch(value=>{if(active)setError(value instanceof Error?value.message:'Workspace could not be loaded.')})
    return()=>{active=false}
  },[projectId])

  function run(action:()=>Promise<void>){startTransition(async()=>{try{setError('');await action();refresh()}catch(value){setError(value instanceof Error?value.message:'The action could not be completed.')}})}

  return <>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">Workspace</h1><p className="mt-2 text-sm text-[#806b60]">Real team access, project assets, and first-party analytics.</p></div><select aria-label="Workspace project" value={projectId} onChange={event=>setProjectId(event.target.value)} className="input max-w-xs"><option value="">Select project</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
    {error&&<p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!projectId?<p className="mt-8 rounded-2xl border border-dashed p-10 text-center text-sm text-[#806b60]">Select a project to manage its workspace.</p>:pending&&!data?<p className="mt-8 text-sm text-[#806b60]">Loading workspace…</p>:data&&<div className="mt-7 grid gap-6 xl:grid-cols-3">
      <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 dark:border-white/10 dark:bg-white/5"><div className="flex items-center gap-2"><FileUp size={19} className="text-[#b87850]"/><h2 className="font-semibold">Asset storage</h2></div><p className="mt-2 text-xs text-[#806b60]">Images, documents, JSON, and CSV. 5 MB per file; 50 MB per project.</p>{data.role!=='viewer'&&<form className="mt-4" onSubmit={event=>{event.preventDefault();const element=event.currentTarget;const form=new FormData(element);run(async()=>{await uploadProjectAssetAction(form);element.reset()})}}><input type="hidden" name="projectId" value={projectId}/><input name="file" type="file" required accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,application/json,text/plain,text/csv" className="block w-full text-xs"/><button disabled={pending} className="mt-3 rounded-xl bg-[#332721] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Upload asset</button></form>}<div className="mt-5 grid gap-2">{data.assets.length===0?<p className="rounded-xl border border-dashed p-4 text-center text-xs text-[#806b60]">No assets uploaded.</p>:data.assets.map(asset=><div key={asset.id} className="flex items-center gap-2 rounded-xl border border-[#eadfd8] p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{asset.name}</p><p className="text-[10px] text-[#806b60]">{Math.ceil(asset.size/1024)} KB · {asset.uploadedByName}</p></div><a href={`/api/assets/${asset.id}`} aria-label={`Download ${asset.name}`} className="rounded-lg p-2 hover:bg-[#fff3eb]"><Download size={15}/></a>{data.role!=='viewer'&&<button type="button" aria-label={`Delete ${asset.name}`} onClick={()=>run(()=>deleteProjectAssetAction(projectId,asset.id))} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={15}/></button>}</div>)}</div></section>

      <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 dark:border-white/10 dark:bg-white/5"><div className="flex items-center gap-2"><Users size={19} className="text-[#b87850]"/><h2 className="font-semibold">Team collaboration</h2></div><p className="mt-2 text-xs text-[#806b60]">Editors can build and upload. Viewers have read-only access.</p>{data.role==='owner'&&<form className="mt-4 grid gap-2" onSubmit={event=>{event.preventDefault();run(async()=>{await addProjectMemberAction(projectId,email,role);setEmail('')})}}><input type="email" required value={email} onChange={event=>setEmail(event.target.value)} placeholder="Existing member email" className="input"/><div className="flex gap-2"><select value={role} onChange={event=>setRole(event.target.value as 'editor'|'viewer')} className="input"><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button disabled={pending} className="rounded-xl bg-[#e98b66] px-4 text-sm font-semibold text-white disabled:opacity-50">Add</button></div></form>}<div className="mt-5 grid gap-2">{data.members.map(member=><div key={member.userId} className="flex items-center gap-2 rounded-xl border border-[#eadfd8] p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.name}</p><p className="truncate text-[10px] text-[#806b60]">{member.email} · {member.role}</p></div>{data.role==='owner'&&member.role!=='owner'&&<button type="button" aria-label={`Remove ${member.name}`} onClick={()=>run(()=>removeProjectMemberAction(projectId,member.userId))} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={15}/></button>}</div>)}</div></section>

      <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 dark:border-white/10 dark:bg-white/5"><div className="flex items-center gap-2"><BarChart3 size={19} className="text-[#b87850]"/><h2 className="font-semibold">Product analytics</h2></div><p className="mt-2 text-xs text-[#806b60]">Privacy-conscious events from the last {data.analytics.days} days.</p><div className="mt-4 rounded-xl bg-[#fff4ed] p-4"><p className="text-3xl font-bold">{data.analytics.total}</p><p className="text-xs text-[#806b60]">Recorded events</p></div><div className="mt-4 grid gap-2">{data.analytics.events.length===0?<p className="rounded-xl border border-dashed p-4 text-center text-xs text-[#806b60]">Events appear as the project is built and deployed.</p>:data.analytics.events.map(event=><div key={event.name} className="flex items-center justify-between rounded-xl border border-[#eadfd8] px-3 py-2"><span className="font-mono text-xs">{event.name}</span><strong className="text-sm">{event.count}</strong></div>)}</div></section>
    </div>}
  </>
}
