import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { signIn, sendPasswordReset } from '@/lib/auth'
import { useAuthStore, isMember, toast } from '@/lib/store'
import { Button, Card, Container, ErrorNote } from '@/components/ui'
import GoogleButton from '@/components/auth/GoogleButton'
import PhoneSignIn from '@/components/auth/PhoneSignIn'

type Method = 'email' | 'phone'

export default function LoginPage() {
  const { userId, profile } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }

  const [method, setMethod] = useState<Method>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = location.state?.from ?? '/browse'

  if (userId) {
    return <Navigate to={isMember(profile) ? from : '/welcome'} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email.trim(), password)
      navigate(from)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then tap reset.')
      return
    }
    try {
      await sendPasswordReset(email.trim())
      toast.success('Check your email for a reset link')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email')
    }
  }

  return (
    <Container className="max-w-md">
      <Card>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          Welcome back to Been-go!
        </p>

        <div className="mt-6">
          <GoogleButton next={from} />
        </div>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
          <span className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
          or
          <span className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
        </div>

        {/* Email and phone are alternatives, not a sequence — a tab
            rather than two stacked forms, so neither looks skippable. */}
        <div
          role="tablist"
          aria-label="Sign-in method"
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
                'rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors',
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
          <PhoneSignIn onVerified={() => navigate(from)} />
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <ErrorNote error={new Error(error)} />}

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
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button type="submit" fullWidth disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-4 text-sm">
              <button onClick={handleReset} className="text-primary-600 hover:underline">
                Forgot password
              </button>
            </div>
          </>
        )}

        <p className="mt-6 border-t border-gray-200 pt-4 text-center text-sm dark:border-slate-700">
          <Link to="/signup" className="text-primary-600 hover:underline">
            Have an invite code?
          </Link>
        </p>
      </Card>
    </Container>
  )
}
