import { getProjectDashboard } from '@/app/actions/projects'
import { ProductShell } from '@/components/lotus/product-shell'
import { getCurrentSession } from '@/lib/auth-session'
import { redirect } from 'next/navigation'
import { getAiProfile } from '@/lib/ai-account'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string; tab?: string }> }) {
  const session = await getCurrentSession()
  if (!session) redirect('/sign-in')
  if (process.env.DATABASE_URL && !(await getAiProfile(session.user.id)).onboardingCompleted) redirect('/onboarding')
  const dashboard = await getProjectDashboard()
  const params = await searchParams
  const requestedSection = params.section
  const initialSection = ['projects', 'templates', 'backend', 'workspace', 'preview', 'deploy', 'settings'].includes(requestedSection ?? '')
    ? requestedSection as 'projects' | 'templates' | 'backend' | 'workspace' | 'preview' | 'deploy' | 'settings'
    : 'projects'

  return (
    <ProductShell
      initialProjects={dashboard.projects}
      initialSettings={dashboard.settings}
      userName={session.user.name}
      initialSection={initialSection}
      initialSettingsTab={params.tab === 'ai' ? 'AI Provider' : undefined}
    />
  )
}
