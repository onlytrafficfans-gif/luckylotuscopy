'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)

    const { error } = isSignUp
      ? await authClient.signUp.email({ email: email.trim().toLowerCase(), password, name: name.trim() })
      : await authClient.signIn.email({ email: email.trim().toLowerCase(), password })

    setLoading(false)

    if (error) {
      setError(isSignUp ? (error.message ?? 'Unable to create this account.') : 'The email or password is incorrect.')
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-[#070605] px-4 py-8 text-white sm:px-8 lg:justify-items-end lg:px-[7vw]">
      <Image src="/lucky-lotus-login-bg.png" alt="Lucky Lotus garden at sunset" fill priority sizes="100vw" className="object-cover object-[48%_center]"/>
      <section className="relative z-10 w-full max-w-[430px] rounded-[28px] border border-[#d99a45]/45 bg-[#090806]/[.92] p-6 shadow-[0_32px_100px_rgba(0,0,0,.72)] backdrop-blur-md sm:p-9">
        <div className="flex justify-center"><Image src="/lucky-lotus-logo.png" alt="Lucky Lotus" width={260} height={180} className="h-auto w-[210px] object-contain drop-shadow-[0_8px_24px_rgba(235,156,47,.28)]" priority/></div>
        <div className="mt-4 text-center">
          <h1 className="font-serif text-3xl font-semibold tracking-[.01em] text-[#fff8ea]">
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-[#d9c9b4]">
            {isSignUp
              ? 'Create your private Lucky Lotus workspace.'
              : 'Sign in to continue to Lucky Lotus.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="name" className="text-[#f6e9d5]">Name</Label>
              <Input
                id="name"
                className="h-12 border-[#d8a45f]/45 bg-white/[.08] text-white focus-visible:border-[#efb85f] focus-visible:ring-[#efb85f]/25"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-[#f6e9d5]">Email address</Label>
            <Input
              id="email"
              className="h-12 border-[#d8a45f]/45 bg-white/[.08] text-white focus-visible:border-[#efb85f] focus-visible:ring-[#efb85f]/25"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-[#f6e9d5]">Password</Label>
            <div className="relative"><Input
              id="password"
              className="h-12 border-[#d8a45f]/45 bg-white/[.08] pr-12 text-white focus-visible:border-[#efb85f] focus-visible:ring-[#efb85f]/25"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            /><button type="button" onClick={()=>setShowPassword(value=>!value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#d7b779] hover:text-[#ffd98f]" aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
          </div>
          {isSignUp && <div className="flex flex-col gap-2"><Label htmlFor="confirm-password" className="text-[#f6e9d5]">Confirm password</Label><Input id="confirm-password" className="h-12 border-[#d8a45f]/45 bg-white/[.08] text-white focus-visible:border-[#efb85f] focus-visible:ring-[#efb85f]/25" type={showPassword?'text':'password'} value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete="new-password"/></div>}

          {error && (
            <p className="rounded-lg border border-red-400/30 bg-red-950/50 px-3 py-2 text-sm text-red-200" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-2 h-12 w-full border border-[#ffce73] bg-[linear-gradient(135deg,#8f4e12,#e5a23b_48%,#8c4a11)] text-sm font-bold text-[#140c03] shadow-[0_10px_30px_rgba(214,137,36,.28)] hover:brightness-110">
            {loading
              ? 'Please wait...'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[#cdbda8]">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <Link
            href={isSignUp ? '/sign-in' : '/sign-up'}
            className="font-semibold text-[#f4bd63] underline-offset-4 hover:underline"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </Link>
        </p>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-[#a99883]"><ShieldCheck size={14}/>Your workspace stays private and encrypted.</p>
      </section>
    </main>
  )
}
