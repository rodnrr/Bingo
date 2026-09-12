import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { signUp } from '@/lib/auth'
import { useAuthStore } from '@/lib/store'
import { Button, Card, Container, ErrorNote } from '@/components/ui'
import GoogleButton from '@/components/auth/GoogleButton'
import PhoneSignIn from '@/components/auth/PhoneSignIn'

type Method = 'email' | 'phone'

/**
 * Signup collects the invite code but does not spend it here. The code
 * is stashed and redeemed on /welcome, once a session exists — because
 * redeem_invite() runs as the signed-in user and there is no session
 * until Supabase confirms the account.
 *
 * That indirection is what lets Google and phone signups work at all:
 * both leave the page (to Google, or to wait for an SMS) before any
 * session exists, and both come back to /welcome to spend the code.
 */
export default function SignupPage() {
  const { userId } = useAuthStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [method, setMethod] = useState<Method>('email')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  // Stash as they type, not on submit: a Google or phone signup hands
  // the browser away before any submit happens, and the code has to
  // already be on the device when /welcome looks for it.
  //
  // Clearing matters as much as writing. A code too short to be real is
  // not "leave the old one alone" — if someone corrects a mistyped code
  // by emptying the field and then signs up with Google, the stale
  // value would follow them to /welcome and be auto-redeemed, spending
  // a single-use invite on an account it was never meant for. What is
  // on screen is what is stored.
  useEffect(() => {
    const value = code.trim().toUpperCase()
    if (value.length < 6) {
      sessionStorage.removeItem('beengo_invite_code')
      localStorage.removeItem('beengo_invite_code')
      return
    }
    sessionStorage.setItem('beengo_invite_code', value)
    localStorage.setItem('beengo_invite_code', value)
  }, [code])

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

        {/* Outside the tabs: the code is required whichever way you
            sign up, and it is saved the moment it is typed. */}
        <div className="mt-6">
          <label className="label" htmlFor="code">Invite code</label>
          <input
            id="code"
            className="input font-mono uppercase tracking-widest"
            placeholder="XXXXXXXX"
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <p className="hint">
            Saved on this device and redeemed as soon as your account exists.
          </p>
        </div>

        <div className="mt-5">
          <GoogleButton label="Sign up with Google" />
        </div>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
          <span className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
          or
          <span className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
        </div>

        <div
          role="tablist"
          aria-label="Sign-up method"
          className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-slate-800"
        >
          {(['email', 'phone'] as Method[]).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={method === m}
              onClick={() => { setMethod(m); setError(null) }}
              className={clsx(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                method === m
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-slate-300',
              )}
            >
              {m === 'email' ? 'Email' : 'Phone'}
            </button>
          ))}
        </div>

        {method === 'phone' ? (
          <PhoneSignIn onVerified={() => navigate('/welcome')} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <ErrorNote error={new Error(error)} />}

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
        )}

        <p className="mt-6 border-t border-gray-200 pt-4 text-center text-sm dark:border-slate-700">
          Already a member?{' '}
          <Link to="/login" className="text-primary-600 hover:underline">Sign in</Link>
        </p>
      </Card>
    </Container>
  )
}
