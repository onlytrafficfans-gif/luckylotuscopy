import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth-session'
import { getProjectAsset } from '@/lib/workspace-features'

export async function GET(_: Request, { params }: { params: Promise<{ assetId:string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error:'Unauthorized' }, { status:401 })
  const asset = await getProjectAsset(session.user.id, (await params).assetId)
  if (!asset) return NextResponse.json({ error:'Not found' }, { status:404 })
  return new NextResponse(new Uint8Array(asset.content), {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.size),
      'Content-Disposition': `attachment; filename="${asset.name.replace(/["\r\n]/g,'_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
