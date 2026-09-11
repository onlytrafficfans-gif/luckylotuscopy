import { describe, expect, it } from 'vitest'
import { parseGeneratedBundle } from '@/lib/generated-bundle'

describe('generated repository bundle', () => {
  it('parses a fenced multi-file response and requires the runtime entry', () => {
    const response = '```json\n'+JSON.stringify({ summary:'Added a component', files:[{path:'src/App.jsx',content:'export default function App(){return <Hero/>}'},{path:'src/Hero.jsx',content:'export function Hero(){return <h1>Hi</h1>}'}]})+'\n```'
    expect(parseGeneratedBundle(response,'src/App.jsx')).toEqual(expect.objectContaining({summary:'Added a component',files:expect.arrayContaining([expect.objectContaining({path:'src/Hero.jsx'})])}))
    expect(()=>parseGeneratedBundle(JSON.stringify({summary:'bad',files:[{path:'src/Hero.jsx',content:'x'}]}),'src/App.jsx')).toThrow('entry file')
  })

  it('rejects unsafe, duplicate, empty, and oversized bundle data', () => {
    expect(()=>parseGeneratedBundle('{"summary":"x","files":[]}','index.html')).toThrow()
    expect(()=>parseGeneratedBundle(JSON.stringify({summary:'x',files:[{path:'../x',content:'x'},{path:'index.html',content:'ok'}]}),'index.html')).toThrow('safe relative path')
    expect(()=>parseGeneratedBundle(JSON.stringify({summary:'x',files:[{path:'index.html',content:'a'},{path:'index.html',content:'b'}]}),'index.html')).toThrow('duplicate')
    expect(()=>parseGeneratedBundle(JSON.stringify({summary:'x',files:[{path:'index.html',content:'x'.repeat(1_048_577)}]}),'index.html')).toThrow('too large')
  })
})
