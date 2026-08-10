import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ScrollText } from 'lucide-react'
import termsDoc from '@/legal/terms.md?raw'
import rulesDoc from '@/legal/rules.md?raw'
import Markdown from '@/components/shared/Markdown'
import { acceptTerms } from '@/lib/api'
import { refreshTerms } from '@/lib/auth'
import { useAuthStore, toast } from '@/lib/store'
import { Button, Card, Container, ErrorNote, LoadingBlock } from '@/components/ui'

/**
 * The agreement gate. Shown to a member who has not accepted the
 * version currently in force — on first join, and again whenever the
 * terms version is bumped.
 *
 * Two deliberate choices:
 *
 * 1. The documents are rendered here, in full, rather than linked. An
 *    agreement someone had to go and find is a weaker agreement.
 * 2. The version sent to accept_terms() is the one the server says is
 *    current, and the RPC rejects it if that has changed since this
 *    page loaded. Consent to superseded text is not consent.
 */
export default function AgreementPage() {
  const { userId, profile, termsVersion, termsAccepted, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }

  const [checkedTerms, setCheckedTerms] = useState(false)
  const [checkedRules, setCheckedRules] = useState(false)
  const [checkedAge, setCheckedAge] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (isLoading) return <LoadingBlock />
  if (!userId) return <Navigate to="/login" replace />
  if (profile?.status !== 'active') return <Navigate to="/welcome" replace />
  if (termsAccepted) return <Navigate to={location.state?.from ?? '/browse'} replace />

  const ready = checkedTerms && checkedRules && checkedAge

  const handleAccept = async () => {
    if (!termsVersion) {
      setError('Could not read the current terms version. Reload and try again.')
      return
    }

    setError(null)
    setBusy(true)
    try {
      await acceptTerms(termsVersion)
      await refreshTerms()
      toast.success('Thanks — you are all set.')
      navigate(location.state?.from ?? '/browse', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your agreement')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="max-w-3xl">
      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <ScrollText className="h-6 w-6 shrink-0 text-primary-600" />
          <div>
            <h1 className="text-2xl font-bold">Before you buy or sell</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
              Read these and agree once. We record which version you agreed to and when.
              If they change materially, we will ask again.
            </p>
            {termsVersion && (
              <p className="mt-1 text-xs text-gray-500">Version {termsVersion}</p>
            )}
          </div>
        </div>
      </Card>

      <Card className="mb-4 max-h-[26rem] overflow-y-auto !p-6">
        <Markdown source={termsDoc} />
      </Card>

      <Card className="mb-4 max-h-[26rem] overflow-y-auto !p-6">
        <Markdown source={rulesDoc} />
      </Card>

      <Card className="space-y-4">
        {error && <ErrorNote error={new Error(error)} />}

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600"
            checked={checkedAge}
            onChange={(e) => setCheckedAge(e.target.checked)}
          />
          <span>I am 18 or older and can enter into a binding agreement.</span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600"
            checked={checkedTerms}
            onChange={(e) => setCheckedTerms(e.target.checked)}
          />
          <span>
            I have read and agree to the{' '}
            <Link to="/legal/terms" target="_blank" className="text-primary-600 underline">
              Terms of Service
            </Link>{' '}
            and the{' '}
            <Link to="/legal/privacy" target="_blank" className="text-primary-600 underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600"
            checked={checkedRules}
            onChange={(e) => setCheckedRules(e.target.checked)}
          />
          <span>
            I have read the{' '}
            <Link to="/legal/rules" target="_blank" className="text-primary-600 underline">
              Community Rules
            </Link>{' '}
            — including the prohibited items list — and I will not list anything on it.
          </span>
        </label>

        <Button fullWidth size="lg" disabled={!ready || busy} onClick={handleAccept}>
          {busy ? 'Recording…' : 'I agree'}
        </Button>

        <p className="text-center text-xs text-gray-500">
          You can read all of these any time from the footer. You can leave at any time —
          see section 11.
        </p>
      </Card>
    </Container>
  )
}
