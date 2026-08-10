import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { signUp } from '@/lib/auth'
import { useAuthStore } from '@/lib/store'
import { Button, Card, Container, ErrorNote } from '@/components/ui'

/**
 * Signup collects the invite code but does not spend it here. The code
 * is stashed and redeemed on /welcome, once a session exists — because
 * redeem_invite() runs as the signed-in user and there is no session
 * until Supabase confirms the account.
 */
export default function SignupPage() {
  const { userId } = useAuthStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(params.get('code') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  if (userId) return <Navigate to="/welcome" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }

    setBusy(true)
    try {
      // Survives the email-confirmation round trip, which may land in a
      // different tab than the one the code was typed into.
      sessionStorage.setItem('beengo_invite_code', code.trim().toUpperCase())
      localStorage.setItem('beengo_invite_code', code.trim().toUpperCase())

      const { session } = await signUp(email.trim(), password, displayName.trim())

      // With email confirmation on, there is no session yet — say so
      // rather than dumping the user on a screen that looks broken.
      if (session) navigate('/welcome')
      else setCheckEmail(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account')
    } finally {
      setBusy(false)
    }
  }

  if (checkEmail) {
    return (
      <Container className="max-w-md">
        <Card>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            We sent a confirmation link to <strong>{email}</strong>. Open it and you will land
            back here to finish joining. Your invite code is saved on this device.
          </p>
        </Card>
      </Container>
    )
  }

  return (
    <Container className="max-w-md">
      <Card>
        <h1 className="text-2xl font-bold">Join Been-go!</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          You need an invite code from an existing member.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <ErrorNote error={new Error(error)} />}

          <div>
            <label className="label" htmlFor="code">Invite code</label>
            <input
              id="code"
              className="input font-mono uppercase tracking-widest"
              placeholder="XXXXXXXX"
              required
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>

          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input
              id="name"
              className="input"
              autoComplete="name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="hint">At least 8 characters.</p>
          </div>

          <Button type="submit" fullWidth disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm">
          Already a member?{' '}
          <Link to="/login" className="text-primary-600 hover:underline">Sign in</Link>
        </p>
      </Card>
    </Container>
  )
}
