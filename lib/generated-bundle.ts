import { z } from 'zod'

const WINDOWS_RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const pathSchema=z.string().min(1).max(240).superRefine((value,context)=>{
  const parts=value.split('/')
  if(value.includes('\\')||value.startsWith('/')||parts.some(part=>!part||part==='.'||part==='..'||WINDOWS_RESERVED.test(part)||/[<>:"|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part))) context.addIssue({code:'custom',message:'File path must be a safe relative path.'})
})
const bundleSchema=z.object({summary:z.string().trim().min(1).max(500),files:z.array(z.object({path:pathSchema,content:z.string().max(1_048_576,'Generated file is too large.')})).min(1).max(100)}).strict()

export type GeneratedBundle=z.infer<typeof bundleSchema>

export function parseGeneratedBundle(value:string,entryPath:string):GeneratedBundle{
  const source=value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')
  let raw:unknown
  try{raw=JSON.parse(source)}catch{throw new Error('The AI response was not a valid repository bundle.')}
  const bundle=bundleSchema.parse(raw)
  if(new Set(bundle.files.map(file=>file.path)).size!==bundle.files.length) throw new Error('Generated bundle contains duplicate file paths.')
  if(!bundle.files.some(file=>file.path===entryPath)) throw new Error(`Generated bundle must include the entry file ${entryPath}.`)
  if(bundle.files.reduce((total,file)=>total+Buffer.byteLength(file.content,'utf8'),0)>5_242_880) throw new Error('Generated bundle exceeds the project size limit.')
  return bundle
}
