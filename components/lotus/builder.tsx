"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Code2, Zap, X,
  Download, Copy, Eye, RotateCcw,
  BookOpen, Database, Folder, Grid2X2, History, KeyRound, Menu, Rocket, Settings, Users,
} from "lucide-react";
import { PreviewWorkbench } from "@/components/lotus/preview-workbench";
import { EditorWorkspace } from "@/components/lotus/editor-workspace";
import { type EditorFile } from "@/lib/editor-workspace";
import { buildProjectPreviewAction, createProjectCheckpointAction, listProjectCheckpointsAction, restoreProjectCheckpointAction, runBuildAction, type WorkspaceMessage } from "@/app/actions/projects";
import { toast } from "sonner";
import { redactSensitiveValues } from "@/lib/safety";
import Image from "next/image";
import Link from "next/link";
import { assembleStaticPreview, type PreviewDiagnostic } from "@/lib/preview-runtime";
import { AuthSignOut } from "@/components/auth-sign-out";

const logoLotus = "/lucky-lotus-logo.png";


// ─── Types ───────────────────────────────────────────────────────────────────
type DeviceMode = "phone" | "tablet" | "desktop";
type BuildView  = "preview" | "code" | "export";

type ProjectCheckpointSummary = Awaited<ReturnType<typeof listProjectCheckpointsAction>>[number];

function downloadGeneratedApp(html: string | null) {
  if (!html) { toast.error("Generate an app first — then you can export it."); return; }
  const url = URL.createObjectURL(new Blob([html], { type:"text/html" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "lotus-preview.html";
  anchor.click();
  URL.revokeObjectURL(url);
}
async function copyGeneratedAppSource(html: string | null) {
  if (!html) { toast.error("Generate an app first — then you can copy its HTML."); return; }
  try {
    await navigator.clipboard.writeText(html);
    toast.success("Preview HTML copied to your clipboard.");
  } catch {
    toast.error("Could not access the clipboard in this context.");
  }
}

export function EmptyPreview() {
  return (
    <div
      className="h-full w-full overflow-auto p-5 sm:p-8"
      style={{
        background:
          "radial-gradient(circle at 50% 12%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 42%), var(--muted)",
      }}
    >
      <div className="flex min-h-full items-center justify-center">
        <section
          aria-label="Phone preview screen"
          className="relative flex h-[min(640px,calc(100vh-190px))] min-h-[440px] w-[min(312px,calc(100vw-3rem))] shrink-0 flex-col overflow-hidden rounded-[2.6rem] border-[7px] shadow-[0_24px_70px_rgba(30,18,6,0.22)]"
          style={{ background:"var(--card)", borderColor:"var(--foreground)" }}
        >
          <div className="absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-full" style={{ background:"var(--foreground)" }} />
          <div className="flex items-center justify-between px-6 pb-3 pt-4 text-[10px] font-semibold" style={{ color:"var(--foreground)" }} aria-hidden="true">
            <span>9:41</span>
            <span className="tracking-widest">● ◒ ▰</span>
          </div>
          <div className="mx-3 flex items-center gap-2 rounded-2xl border px-3 py-2" style={{ background:"var(--background)", borderColor:"var(--border)" }}>
            <div className="flex h-7 w-7 items-center justify-center rounded-xl" style={{ background:"color-mix(in srgb, var(--accent) 14%, transparent)" }}>
              <Sparkles size={13} style={{ color:"var(--accent)" }}/>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold" style={{ color:"var(--foreground)" }}>Untitled app</p>
              <p className="text-[9px]" style={{ color:"var(--muted-foreground)" }}>Live preview</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background:"color-mix(in srgb, var(--accent) 14%, transparent)", border:"1px solid color-mix(in srgb, var(--accent) 24%, transparent)" }}>
              <Sparkles size={21} style={{ color:"var(--accent)" }}/>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color:"var(--foreground)" }}>Start building</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color:"var(--muted-foreground)" }}>Describe what you want to build in the chat.</p>
            </div>
          </div>
          <div className="mx-auto mb-2 h-1 w-24 rounded-full" style={{ background:"var(--foreground)", opacity:0.7 }} aria-hidden="true" />
        </section>
      </div>
    </div>
  );
}
// ─── Deployed panel ───────────────────────────────────────────────────────────
function ExportPanel({ html, projectName }:{ html:string|null; projectName:string }) {
  const ready = !!html;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background:"rgba(200,146,42,0.12)", border:"1px solid rgba(200,146,42,0.2)" }}>
        <Zap size={20} className="text-accent"/>
      </div>
      <div className="text-center">
        <h3 style={{ fontFamily:"Fraunces,serif", fontSize:18, fontWeight:500, color:"var(--foreground)", marginBottom:6 }}>
          {ready ? `Export “${projectName}”` : "Nothing to export yet"}
        </h3>
        <p style={{ fontSize:12, color:"var(--muted-foreground)", maxWidth:300, lineHeight:1.6 }}>
          {ready
            ? "Download the current preview as a safe standalone HTML snapshot, or copy its source."
            : "Describe an app in chat to generate it — then you can export or copy its HTML."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 mt-2 justify-center">
        <button onClick={()=>downloadGeneratedApp(html)} disabled={!ready}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
          style={{ background:"var(--primary)", color:"var(--primary-foreground)", opacity:ready?1:0.5, cursor:ready?"pointer":"not-allowed" }}>
          <Download size={12}/> Download Preview
        </button>
        <button onClick={()=>copyGeneratedAppSource(html)} disabled={!ready}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
          style={{ background:"var(--muted)", color:"var(--muted-foreground)", opacity:ready?1:0.5, cursor:ready?"pointer":"not-allowed" }}>
          <Copy size={12}/> Copy HTML
        </button>
      </div>
    </div>
  );
}

// ─── Overlay modal shell ──────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
      <div className="absolute inset-0" style={{ background:"rgba(30,18,6,0.5)", backdropFilter:"blur(4px)" }} onClick={onClose}/>
      <motion.div className="relative w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ background:"var(--card)", border:"1px solid var(--border)", maxHeight:"80vh", boxShadow:"0 32px 80px rgba(0,0,0,0.25)" }}
        initial={{ y:24, scale:0.97 }} animate={{ y:0, scale:1 }} exit={{ y:24, scale:0.97 }}
        transition={{ duration:0.25, ease:[0.22,1,0.36,1] }}>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <span style={{ fontFamily:"Fraunces,serif", fontSize:16, fontWeight:500, color:"var(--foreground)" }}>{title}</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:opacity-70" style={{ background:"var(--muted)", color:"var(--muted-foreground)" }}><X size={13}/></button>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth:"none" }}>{children}</div>
      </motion.div>
    </motion.div>
  );
}

interface LotusBuilderProps {
  initial: {
    projectId: string | null;
    name: string;
    html: string | null;
    messages: WorkspaceMessage[];
    userName: string;
    editorFontSize: number;
    defaultDevice: DeviceMode;
    theme: "system" | "light" | "dark";
    files: EditorFile[];
    entryPath: string;
    runtime: "static" | "react";
  };
}

export default function App({ initial }: LotusBuilderProps) {
  // Core
  const [projectId, setProjectId] = useState<string | null>(initial.projectId);
  const [projectName, setProjectName] = useState<string>(initial.name || "Untitled");
  const initialPreview = initial.runtime === "static" ? assembleStaticPreview(initial.files, initial.entryPath) : { html: "", diagnostics: [] };
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(initialPreview.html || null);
  const [previewDiagnostics, setPreviewDiagnostics] = useState<PreviewDiagnostic[]>(initialPreview.diagnostics);
  const [builderFiles, setBuilderFiles] = useState<EditorFile[]>(initial.files);
  const [entryPath, setEntryPath] = useState(initial.entryPath);
  const [input,     setInput]     = useState("");
  const [isTyping,  setIsTyping]  = useState(false);
  const [view,      setView]      = useState<BuildView>("preview");

  // UI open/close
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [checkpoints, setCheckpoints] = useState<ProjectCheckpointSummary[]>([]);
  const [checkpointBusy, setCheckpointBusy] = useState(false);

  // Build state
  const [autosaved,    setAutosaved]    = useState(true);
  const [dragKey,      setDragKey]      = useState(0); // reset phone position
  const [,             setHistory]      = useState<{ label:string; html:string|null }[]>([{ label:"Initial build", html: initialPreview.html || null }]);
  const [historyIdx,   setHistoryIdx]   = useState(0);

  const previewRequestRef = useRef(0);
  const previewSessionRef = useRef(globalThis.crypto.randomUUID());

  useEffect(() => {
    const revision = ++previewRequestRef.current;
    if (initial.runtime === "static") {
      const result = assembleStaticPreview(builderFiles, entryPath);
      if (revision === previewRequestRef.current) {
        setGeneratedHtml(result.html);
        setPreviewDiagnostics(result.diagnostics);
      }
      return;
    }
    if (!projectId) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      buildProjectPreviewAction(projectId, revision, previewSessionRef.current).then((result) => {
        if (cancelled || revision !== previewRequestRef.current) return;
        setGeneratedHtml(result.html);
        setPreviewDiagnostics(result.diagnostics);
      }).catch((error: unknown) => {
        if (!cancelled && revision === previewRequestRef.current) setPreviewDiagnostics([{ severity:"error", message:error instanceof Error ? error.message : "Local build failed." }]);
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [builderFiles, entryPath, initial.runtime, projectId]);

  async function handleSend(text = input.trim()) {
    if (!text || isTyping) return;
    const safeText = redactSensitiveValues(text);
    setInput("");
    setIsTyping(true);
    setAutosaved(false);
    try {
      const result = await runBuildAction({
        projectId,
        prompt: text,
        model: "default",
        currentHtml: builderFiles.find(file => file.path === entryPath)?.content ?? generatedHtml,
        context: {},
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const res = result.data;
      setProjectId(res.projectId);
      setProjectName(res.name);
      const nextFiles = builderFiles.map(file => file.path === res.entryPath ? { ...file, content: res.html, version: res.version } : file);
      setBuilderFiles(nextFiles);
      const preview = initial.runtime === "static"
        ? assembleStaticPreview(nextFiles, entryPath)
        : await buildProjectPreviewAction(res.projectId, 0, previewSessionRef.current);
      setGeneratedHtml(preview.html);
      setPreviewDiagnostics(preview.diagnostics);
      setView("preview");
      toast.success(res.reply);
      setHistory(h=>[...h.slice(0,historyIdx+1), { label:safeText, html:preview.html }]);
      setHistoryIdx(i=>i+1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong while building.");
    } finally {
      setIsTyping(false);
      setAutosaved(true);
    }
  }

  async function openHistory() {
    if (!projectId) return;
    setCheckpointBusy(true); setShowHistory(true);
    try { setCheckpoints(await listProjectCheckpointsAction(projectId)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Version history could not be loaded."); }
    finally { setCheckpointBusy(false); }
  }

  async function createCheckpoint() {
    if (!projectId) return;
    const label = window.prompt("Checkpoint name", `Checkpoint ${checkpoints.length + 1}`)?.trim();
    if (!label) return;
    setCheckpointBusy(true);
    try { await createProjectCheckpointAction(projectId, label); setCheckpoints(await listProjectCheckpointsAction(projectId)); toast.success("Checkpoint created."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Checkpoint could not be created."); }
    finally { setCheckpointBusy(false); }
  }

  async function restoreCheckpoint(checkpointId:string) {
    if (!projectId || !window.confirm("Restore this checkpoint? Current project files will be replaced.")) return;
    setCheckpointBusy(true);
    try {
      const workspace = await restoreProjectCheckpointAction(projectId, checkpointId);
      if (!workspace) throw new Error("Restored workspace could not be loaded.");
      setBuilderFiles(workspace.files); setEntryPath(workspace.entryPath); setGeneratedHtml(workspace.html); setShowHistory(false); setDragKey(key=>key+1); toast.success("Checkpoint restored.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Checkpoint could not be restored."); }
    finally { setCheckpointBusy(false); }
  }

  return (
    <div className="relative size-full flex flex-col overflow-hidden bg-[#fffdfb] text-[#241b16] lg:pl-[248px]" style={{ fontFamily:"Outfit,sans-serif" }}>

      {mobileNavOpen && <button type="button" aria-label="Close navigation overlay" onClick={()=>setMobileNavOpen(false)} className="fixed inset-0 z-40 bg-black/25 lg:hidden"/>}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-[#eadfd8] bg-[#fffcfa] px-5 pb-5 pt-7 transition-transform lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`} aria-label="Lucky Lotus navigation">
        <button type="button" onClick={()=>setMobileNavOpen(false)} aria-label="Close navigation" className="absolute right-3 top-3 rounded-lg p-2 lg:hidden"><X size={18}/></button>
        <div className="flex flex-col items-center pt-2">
          <Image src={logoLotus} alt="Lucky Lotus" width={124} height={124} loading="eager" className="h-[124px] w-[124px] object-contain" />
          <p className="-mt-1 text-[10px] font-semibold tracking-[0.32em] text-[#5d4538]">APP BUILDER</p>
        </div>
        <nav className="mt-8 grid gap-1.5">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#5f4a3f] hover:bg-[#fff6f0]"><Folder size={19}/>Projects</Link>
          <Link href="/?section=templates" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#5f4a3f] hover:bg-[#fff6f0]"><Grid2X2 size={19}/>Templates</Link>
          <Link href="/?section=backend" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#5f4a3f] hover:bg-[#fff6f0]"><Database size={19}/>Backend</Link>
          <Link href="/?section=workspace" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#5f4a3f] hover:bg-[#fff6f0]"><Users size={19}/>Workspace</Link>
          <button type="button" onClick={()=>{setView("preview");setMobileNavOpen(false)}} className="flex items-center gap-3 rounded-xl bg-[#fff0e5] px-4 py-3 text-left text-sm font-semibold text-[#3c2a20]"><Eye size={19}/>Preview</button>
          <Link href="/?section=deploy" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#5f4a3f] hover:bg-[#fff6f0]"><Rocket size={19}/>Deploy</Link>
        </nav>
        <nav className="mt-auto grid gap-1 border-t border-[#eadfd8] pt-4"><Link href="/?section=settings&tab=ai" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#5f4a3f] hover:bg-[#fff6f0]"><KeyRound size={19}/>AI Provider</Link><Link href="/?section=settings" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[#5f4a3f] hover:bg-[#fff6f0]"><Settings size={19}/>Settings</Link></nav>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#eadfd8] bg-white px-3 py-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ffb887] text-sm font-semibold">{initial.userName.trim().slice(0,2).toUpperCase() || "DU"}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{initial.userName}</p><p className="text-xs text-[#806b60]">Account owner</p></div>
          <AuthSignOut compact/>
        </div>
      </aside>

      {/* ── Top bar ── */}
      <header className="flex h-[92px] flex-shrink-0 items-center justify-between gap-4 border-b border-[#f1e8e3] bg-[#fffdfb] px-4 sm:h-[112px] sm:px-8 lg:h-[132px] lg:px-14">

        {/* Logo */}
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={()=>setMobileNavOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 lg:hidden"><Menu size={21}/></button>
          <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl lg:text-4xl">App Builder</h1>
          <p className="mt-1 text-xs text-[#6c584d] sm:mt-2 sm:text-sm lg:text-base">Describe, preview, and deploy your app.</p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <Link href="/docs" className="hidden h-12 items-center gap-2 rounded-xl border border-[#eadfd8] bg-white px-5 text-sm font-semibold text-[#49382f] shadow-sm sm:flex"><BookOpen size={21}/>Docs</Link>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">


        {/* ── Preview / Code / Export ── */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#fffdfb] px-2 pb-2 sm:px-5 sm:pb-4 lg:px-8 lg:pb-7">

          {/* Preview toolbar */}
          <div className="flex flex-shrink-0 items-center justify-between py-2 sm:py-3">
            {/* View tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-[#fff4ed] p-1">
              {([["preview","Preview",<Eye key="preview" size={11}/>],["code","Code",<Code2 key="code" size={11}/>],["export","Export",<Zap key="export" size={11}/>]] as const).map(([k,l,icon])=>(
                <button key={k} onClick={()=>setView(k as BuildView)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background:view===k?"#fff":"transparent", color:view===k?"#2b211b":"#806b60", boxShadow:view===k?"0 1px 5px rgba(79,49,31,0.09)":"none" }}>
                  {icon}{l}
                </button>
              ))}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              <button type="button" disabled={!projectId} onClick={openHistory} className="flex items-center gap-1 rounded-lg border border-[#eadfd8] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5f4a3f] disabled:opacity-40"><History size={12}/> History</button>
              {view==="preview" && <>
                <button onClick={()=>setDragKey(k=>k+1)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all hover:opacity-80"
                  style={{ background:"var(--muted)", color:"var(--muted-foreground)" }}>
                  <RotateCcw size={10}/> Reset
                </button>
              </>}
            </div>
          </div>


          {/* View content */}
          {view==="preview" && (generatedHtml || previewDiagnostics.length > 0) && <div className="min-h-0 flex-1 overflow-hidden rounded-[20px] border border-[#eadfd8] bg-white shadow-[0_12px_40px_rgba(93,56,34,0.07)]"><PreviewWorkbench key={dragKey} html={generatedHtml ?? ""} diagnostics={previewDiagnostics} initialDevice={initial.defaultDevice} onVisualEdit={(selection,instruction)=>handleSend(`Update the selected ${selection.tag} (${selection.selector}) whose current text is ${JSON.stringify(selection.text)}. ${instruction}`)}/></div>}
          {view==="preview" && !generatedHtml && previewDiagnostics.length === 0 && <div className="min-h-0 flex-1 overflow-hidden rounded-[20px] border border-[#eadfd8] bg-white"><EmptyPreview/></div>}

          {projectId
            ? <div className={view === "code" ? "flex min-h-0 flex-1" : "hidden"} aria-hidden={view !== "code"}>
              <EditorWorkspace
                active={view === "code"}
                runtime={initial.runtime}
                projectId={projectId}
                files={builderFiles}
                entryPath={entryPath}
                initialFontSize={initial.editorFontSize}
                onFilesChange={setBuilderFiles}
                onEntryPathChange={setEntryPath}
                onPreviewChange={(html) => { setGeneratedHtml(html); setAutosaved(true); }}
              />
              </div>
            : view === "code" && <div className="flex flex-1 items-center justify-center text-sm" style={{ color:"var(--muted-foreground)" }}>Create the project before editing files.</div>}
          {view==="export" && <ExportPanel html={generatedHtml} projectName={projectName}/>}

          {view === "preview" && <div className="mt-2 flex flex-shrink-0 items-center gap-2 rounded-[18px] border border-[#eadfd8] bg-white p-2 shadow-[0_10px_30px_rgba(93,56,34,0.08)] sm:mt-4 sm:gap-3 sm:p-4">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-[#f0e2d9] text-[#f29a70] shadow-sm"><Sparkles size={25}/></span>
            <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); handleSend(); } }} rows={1} placeholder="Describe the app you want to build..." className="min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-base text-[#2d211b] outline-none placeholder:text-[#806b60]"/>
            <motion.button whileTap={{scale:0.98}} onClick={()=>handleSend()} disabled={!input.trim() || isTyping} className="inline-flex h-12 flex-shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-[#ffb17f] to-[#e8835f] px-4 text-sm font-semibold text-white shadow-[0_7px_20px_rgba(232,131,95,0.3)] disabled:opacity-60 sm:px-7 sm:text-base"><Sparkles size={19}/><span className="hidden sm:inline">Generate App</span><span className="sm:hidden">Generate</span></motion.button>
          </div>}

          {/* Active build context bar */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5" style={{ borderTop:"1px solid var(--border)", background:"var(--card)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[9px] font-semibold text-[var(--accent)]">{initial.runtime === "react" ? "React workspace" : "Static workspace"}</span>
              <span className="font-mono text-[9px] text-[var(--muted-foreground)]">· {builderFiles.length} real {builderFiles.length === 1 ? "file" : "files"}</span>
              <span className="font-mono text-[9px] text-[var(--muted-foreground)]">· {entryPath}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {autosaved
                ? <><div className="w-1.5 h-1.5 rounded-full" style={{ background:"#6BCB77" }}/><span style={{ fontSize:9, color:"var(--muted-foreground)" }}>Saved</span></>
                : <><motion.div className="w-1.5 h-1.5 rounded-full" style={{ background:"var(--accent)" }} animate={{ opacity:[1,0.3,1] }} transition={{ duration:1, repeat:Infinity }}/><span style={{ fontSize:9, color:"var(--muted-foreground)" }}>Saving…</span></>
              }
            </div>
          </div>
        </main>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showHistory && <CheckpointPanel checkpoints={checkpoints} busy={checkpointBusy} onCreate={createCheckpoint} onRestore={restoreCheckpoint} onClose={()=>setShowHistory(false)}/>}
      </AnimatePresence>
    </div>
  );
}

function CheckpointPanel({ checkpoints, busy, onCreate, onRestore, onClose }:{ checkpoints:ProjectCheckpointSummary[]; busy:boolean; onCreate:()=>void; onRestore:(id:string)=>void; onClose:()=>void }) {
  return <Modal title="Version history" onClose={onClose}><div className="p-4">
    <button type="button" disabled={busy} onClick={onCreate} className="w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] disabled:opacity-50">Create checkpoint</button>
    <p className="mt-2 text-xs text-[var(--muted-foreground)]">Stores every project file, runtime setting, and product specification.</p>
    <div className="mt-4 grid gap-2">{checkpoints.length===0?<p className="rounded-xl border border-dashed p-5 text-center text-sm text-[var(--muted-foreground)]">No checkpoints yet.</p>:checkpoints.map(checkpoint=><div key={checkpoint.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{checkpoint.label}</p><p className="mt-1 text-[10px] text-[var(--muted-foreground)]">{checkpoint.fileCount} files · {new Date(checkpoint.createdAt).toLocaleString()}</p></div><button type="button" disabled={busy} onClick={()=>onRestore(checkpoint.id)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Restore</button></div>)}</div>
  </div></Modal>
}
export type { LotusBuilderProps };
