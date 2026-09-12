import { redirect } from 'next/navigation'
import { AiOnboarding } from '@/components/lotus/ai-onboarding'
import { getCurrentSession } from '@/lib/auth-session'
import { getAiProfile } from '@/lib/ai-account'

export const dynamic='force-dynamic'
export default async function OnboardingPage(){const session=await getCurrentSession();if(!session)redirect('/sign-in');if(!process.env.DATABASE_URL)redirect('/');const profile=await getAiProfile(session.user.id);if(profile.onboardingCompleted)redirect('/');return <AiOnboarding/>}
