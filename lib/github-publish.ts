import { z } from 'zod'

const publishInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(350),
  private: z.boolean(),
  files: z.array(z.object({ path: z.string().min(1).max(240), content: z.string().max(1_048_576) })).min(1).max(100),
})

function repositoryName(value:string){return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100)||'lucky-lotus-app'}

export async function publishGitHubRepository(token:string,input:unknown,fetcher:typeof fetch=fetch){
  if(token.trim().length<8)throw new Error('A valid GitHub token is required.')
  const parsed=publishInputSchema.parse(input)
  async function request(url:string,body:unknown){
    const response=await fetcher(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'Lucky-Lotus-App-Builder'},body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20_000)})
    const text=await response.text();if(text.length>262_144)throw new Error('GitHub returned an oversized response.')
    let payload:unknown;try{payload=text?JSON.parse(text):{}}catch{throw new Error('GitHub returned an invalid response.')}
    if(!response.ok){const error=z.object({message:z.string().max(500)}).safeParse(payload);throw new Error(error.success?error.data.message:'GitHub rejected the request.')}
    return payload
  }
  const repository=z.object({full_name:z.string(),html_url:z.string().url(),default_branch:z.string()}).parse(await request('https://api.github.com/user/repos',{name:repositoryName(parsed.name),description:parsed.description,private:parsed.private,auto_init:false}))
  const tree=z.object({sha:z.string()}).parse(await request(`https://api.github.com/repos/${repository.full_name}/git/trees`,{tree:parsed.files.map(file=>({path:file.path,mode:'100644',type:'blob',content:file.content}))}))
  const commit=z.object({sha:z.string()}).parse(await request(`https://api.github.com/repos/${repository.full_name}/git/commits`,{message:'Initial project from Lucky Lotus',tree:tree.sha,parents:[]}))
  await request(`https://api.github.com/repos/${repository.full_name}/git/refs`,{ref:`refs/heads/${repository.default_branch}`,sha:commit.sha})
  return{repository:repository.full_name,url:repository.html_url,branch:repository.default_branch,commitSha:commit.sha}
}
