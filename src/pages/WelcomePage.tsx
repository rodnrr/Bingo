import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { redeemInvite } from '@/lib/api'
import { refreshProfile } from '@/lib/auth'
import { useAuthStore, isMember, toast } from '@/lib/store'
import { Button, Card, Container, ErrorNote, LoadingBlock } from '@/components/ui'

/**
 * The invite gate. Everyone who signs up lands here, and nothing else
 * in the app opens until redeem_invite() succeeds.
 */
export default function WelcomePage() {
  const { userId, profile, isLoading } = useAuthStore()
  const navigate = useNavigate()
  // Set by /auth/callback when the user was heading somewhere specific
  // before Google took over the tab.
  const location = useLocation() as { state?: { from?: string } }
  const next = location.state?.from ?? '/browse'

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const autoTried = useRef(false)

  const redeem = async (value: string) => {
    setError(null)
    setBusy(true)
    try {
      await redeemInvite(value.trim().toUpperCase())
      await refreshProfile()
      sessionStorage.removeItem('beengo_invite_code')
      localStorage.removeItem('beengo_invite_code')
      toast.success('You are in. Welcome to Been-go!')
      navigate(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not redeem that code')
    } finally {
      setBusy(false)
    }
  }

  // A code typed at signup is redeemed automatically once the session
  // exists — the user should not have to type it a second time.
  useEffect(() => {
    if (autoTried.current || !userId || profile?.status !== 'pending_invite') return

    const saved =
      sessionStorage.getItem('beengo_invite_code') ??
      localStorage.getItem('beengo_invite_code')

    if (saved) {
      autoTried.current = true
      setCode(saved)
      redeem(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profile?.status])

  if (isLoading) return <LoadingBlock />
  if (!userId) return <Navigate to="/login" replace />
  if (isMember(profile)) return <Navigate to={next} replace />

  if (profile?.status === 'suspended') {
    return (
      <Container className="max-w-md">
        <Card>
          <h1 className="text-2xl font-bold">Account suspended</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            This account cannot use Been-go right now. If you think that is a mistake, reply to
            the person who invited you.
          </p>
        </Card>
      </Container>
    )
  }

  return (
    <Container className="max-w-md">
      <Card>
        <h1 className="text-2xl font-bold">One more step</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          Been-go! is invite only. Enter the code a member sent you.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => { e.preventDefault(); redeem(code) }}
        >
          {error && <ErrorNote error={new Error(error)} />}

          <div>
            <label className="label" htmlFor="code">Invite code</label>
            <input
              id="code"
              className="input text-center font-mono text-lg uppercase tracking-[0.3em]"
              placeholder="XXXXXXXX"
              required
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>

          <Button type="submit" fullWidth disabled={busy || !code.trim()}>
            {busy ? 'Checking…' : 'Join Been-go!'}
          </Button>
        </form>
      </Card>
    </Container>
  )
}
