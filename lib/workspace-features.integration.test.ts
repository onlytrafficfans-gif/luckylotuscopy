import { beforeEach, describe, expect, it, vi } from 'vitest'

const {query,mockRow,mockRows}=vi.hoisted(()=>({query:vi.fn(),mockRow:vi.fn(),mockRows:vi.fn()}))
vi.mock('@/lib/db/postgres', () => ({ postgresPool:{query}, row:mockRow, rows:mockRows }))

import { deleteProjectAsset, getAnalyticsSummary, getProjectAsset, getProjectRole, listProjectAssets, listProjectMembers, recordAnalyticsEvent, removeProjectMember, storeProjectAsset, upsertProjectMember } from '@/lib/workspace-features'

const projectId='11111111-1111-4111-8111-111111111111'
const userId='user-1'

beforeEach(()=>{query.mockReset();mockRow.mockReset();mockRows.mockReset();query.mockResolvedValue({rowCount:1})})

describe('workspace database services',()=>{
  it('resolves roles and lists a protected roster',async()=>{
    mockRow.mockResolvedValueOnce({role:'editor'}).mockResolvedValueOnce({role:'owner'})
    mockRows.mockResolvedValueOnce([{userId,name:'Owner',email:'owner@example.com',role:'owner',createdAt:new Date()}])
    await expect(getProjectRole(userId,projectId)).resolves.toBe('editor')
    await expect(listProjectMembers(userId,projectId)).resolves.toHaveLength(1)
  })

  it('adds and removes existing members with an audit record',async()=>{
    mockRow.mockResolvedValueOnce({role:'owner'}).mockResolvedValueOnce({count:'0'}).mockResolvedValueOnce({id:'member-1',name:'Member',email:'member@example.com'})
      .mockResolvedValueOnce({role:'owner'}).mockResolvedValueOnce({count:'0'})
    await expect(upsertProjectMember(userId,projectId,'member@example.com','editor')).resolves.toMatchObject({userId:'member-1',role:'editor'})
    await expect(removeProjectMember(userId,projectId,'member-1')).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledTimes(4)
  })

  it('stores, lists, downloads, and deletes authorized assets',async()=>{
    const content=Buffer.from('image')
    mockRow.mockResolvedValueOnce({role:'editor'}).mockResolvedValueOnce({count:'0'}).mockResolvedValueOnce({total:'0'})
      .mockResolvedValueOnce({role:'viewer'})
      .mockResolvedValueOnce({id:'asset-1',projectId,name:'hero.png',mimeType:'image/png',size:5,content}).mockResolvedValueOnce({role:'viewer'})
      .mockResolvedValueOnce({role:'editor'}).mockResolvedValueOnce({count:'0'})
    mockRows.mockResolvedValueOnce([{id:'asset-1',name:'hero.png'}])
    await expect(storeProjectAsset(userId,{projectId,name:'hero.png',mimeType:'image/png',size:5},content)).resolves.toMatchObject({name:'hero.png'})
    await expect(listProjectAssets(userId,projectId)).resolves.toHaveLength(1)
    await expect(getProjectAsset(userId,'asset-1')).resolves.toMatchObject({name:'hero.png'})
    await expect(deleteProjectAsset(userId,projectId,'asset-1')).resolves.toBeUndefined()
  })

  it('records sanitized events and returns numeric summaries',async()=>{
    mockRow.mockResolvedValueOnce({role:'editor'}).mockResolvedValueOnce({role:'viewer'})
    mockRows.mockResolvedValueOnce([{name:'builder.generated',count:'2'}]).mockResolvedValueOnce([{day:'2026-09-11',count:'2'}])
    await recordAnalyticsEvent(userId,projectId,{name:'builder.generated',properties:{device:'desktop',token:'hidden'}})
    await expect(getAnalyticsSummary(userId,projectId,500)).resolves.toEqual({days:90,total:2,events:[{name:'builder.generated',count:2}],daily:[{day:'2026-09-11',count:2}]})
    expect(query.mock.calls[0][1][4]).toEqual({device:'desktop'})
  })

  it('denies viewers from mutations and rejects missing records',async()=>{
    mockRow.mockResolvedValueOnce({role:'viewer'}).mockResolvedValueOnce({role:'owner'}).mockResolvedValueOnce({count:'0'})
    await expect(deleteProjectAsset(userId,projectId,'asset-1')).rejects.toThrow('access denied')
    query.mockResolvedValueOnce({rowCount:0})
    await expect(removeProjectMember(userId,projectId,'missing')).rejects.toThrow('not found')
  })

  it('handles missing access, missing assets, mismatched uploads, and rate limits',async()=>{
    mockRow.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({role:'editor'}).mockResolvedValueOnce({count:'0'})
      .mockResolvedValueOnce({role:'editor'}).mockResolvedValueOnce({count:'20'})
    await expect(getProjectRole(userId,projectId)).resolves.toBeNull()
    await expect(getProjectAsset(userId,'missing')).resolves.toBeNull()
    await expect(storeProjectAsset(userId,{projectId,name:'hero.png',mimeType:'image/png',size:5},Buffer.from('x'))).rejects.toThrow('did not match')
    await expect(deleteProjectAsset(userId,projectId,'asset-1')).rejects.toThrow('Too many')
  })

  it('records anonymous events without a membership lookup',async()=>{
    await recordAnalyticsEvent(null,projectId,{name:'preview.opened',properties:{count:1,active:true,note:null}})
    expect(query).toHaveBeenCalledOnce()
  })
})
