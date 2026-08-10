import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
import { payoutLink, updateProfile } from '@/lib/api'
import { refreshProfile, signOut } from '@/lib/auth'
import { useAuthStore, toast } from '@/lib/store'
import { Button, Card, Container, PageHeading } from '@/components/ui'

export default function AccountPage() {
  const { userId, email, profile } = useAuthStore()
  const [params, setParams] = useSearchParams()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')

  // Coming back from Stripe: the account.updated webhook may land a
  // moment before or after this redirect, so re-read the profile rather
  // than trusting the query param to mean "enabled".
  useEffect(() => {
    if (params.get('payouts')) {
      refreshProfile()
      const next = new URLSearchParams(params)
      next.delete('payouts')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const save = useMutation({
    mutationFn: () =>
      updateProfile(userId!, { display_name: displayName.trim(), bio: bio.trim() || null }),
    onSuccess: async () => {
      await refreshProfile()
      toast.success('Profile saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const connect = useMutation({
    mutationFn: (action: 'onboard' | 'dashboard') => payoutLink(action),
    onSuccess: (url) => { window.location.href = url },
    onError: (err: Error) => toast.error(err.message),
  })

  const chargesOn = profile?.stripe_charges_enabled ?? false
  const payoutsOn = profile?.stripe_payouts_enabled ?? false
  const started   = Boolean(profile?.stripe_account_id)

  return (
    <Container className="max-w-2xl">
      <PageHeading title="Account" subtitle={email ?? undefined} />

      {/* ── Payouts ── */}
      <Card className="mb-4">
        <h2 className="font-semibold">Getting paid</h2>

        {chargesOn && payoutsOn ? (
          <div className="mt-3 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success-600" />
            <div>
              <p className="text-sm font-medium text-success-600">Payouts are active</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                Money from your sales goes to your bank on Stripe's normal schedule, minus the
                RiseBay fee.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={connect.isPending}
                onClick={() => connect.mutate('dashboard')}
              >
                Stripe dashboard <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning-600" />
            <div>
              <p className="text-sm font-medium text-warning-600">
                {started ? 'Stripe still needs a few details' : 'Not set up yet'}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                Stripe collects your identity and bank details directly — RiseBay never sees or
                stores them. Until this is finished, buyers cannot check out on your listings.
              </p>
              <Button
                className="mt-3"
                disabled={connect.isPending}
                onClick={() => connect.mutate('onboard')}
              >
                {connect.isPending
                  ? 'Opening Stripe…'
                  : started ? 'Finish setup' : 'Set up payouts'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Profile ── */}
      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">Profile</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); save.mutate() }}
        >
          <div>
            <label className="label" htmlFor="name">Display name</label>
            <input
              id="name"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="bio">About you</label>
            <textarea
              id="bio"
              className="input min-h-[80px]"
              placeholder="Buyers see this on your listings."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">Session</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          Invites left: <strong>{profile?.invites_remaining ?? 0}</strong>
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => signOut()}>
          Sign out
        </Button>
      </Card>
    </Container>
  )
}
