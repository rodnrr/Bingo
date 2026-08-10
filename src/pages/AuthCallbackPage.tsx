import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button, Card, Container, ErrorNote, LoadingBlock } from '@/components/ui'

/**
 * Where Supabase sends people back after an email link. Two jobs:
 * finish a confirmation (session already in the URL, handled by
 * detectSessionInUrl), or take a new password after a reset link.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isReset = params.get('mode') === 'reset'

  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isReset) return

    // detectSessionInUrl has already consumed the fragment by now; just
    // find out whether it worked and route accordingly.
    supabase.auth.getSession().then(({ data: { session } }) => {
      navigate(session ? '/welcome' : '/login', { replace: true })
    })
  }, [isReset, navigate])

  if (!isReset) return <LoadingBlock label="Finishing sign in…" />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (updateError) setError(updateError.message)
    else navigate('/browse', { replace: true })
  }

  return (
    <Container className="max-w-md">
      <Card>
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <ErrorNote error={new Error(error)} />}
          <div>
            <label className="label" htmlFor="password">New password</label>
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
          </div>
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      </Card>
    </Container>
  )
}
