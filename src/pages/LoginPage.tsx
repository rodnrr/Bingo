import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { signIn, sendPasswordReset } from '@/lib/auth'
import { useAuthStore } from '@/lib/store'
import { toast } from '@/lib/store'
import { Button, Card, Container, ErrorNote } from '@/components/ui'

export default function LoginPage() {
  const { userId, profile } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (userId) {
    const target = profile?.status === 'active'
      ? (location.state?.from ?? '/browse')
      : '/welcome'
    return <Navigate to={target} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email.trim(), password)
      navigate(location.state?.from ?? '/browse')
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
        <p className="mt-1 text-sm text-fg-muted">
          Welcome back to Been-go!
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

        <div className="mt-4 flex items-center justify-between text-sm">
          <button onClick={handleReset} className="text-primary hover:underline">
            Forgot password
          </button>
          <Link to="/signup" className="text-primary hover:underline">
            Have an invite code?
          </Link>
        </div>
      </Card>
    </Container>
  )
}
