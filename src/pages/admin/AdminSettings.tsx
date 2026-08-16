import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminRecentActions, adminSetFeeBps, getSettings } from '@/lib/api'
import { money, timeAgo } from '@/lib/format'
import { toast } from '@/lib/store'
import { Button, Card, ErrorNote, LoadingBlock } from '@/components/ui'

export default function AdminSettings() {
  const queryClient = useQueryClient()
  const [feeInput, setFeeInput] = useState('')

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const { data: actions } = useQuery({
    queryKey: ['admin-actions'],
    queryFn: adminRecentActions,
  })

  useEffect(() => {
    if (settings) setFeeInput((settings.fee_bps / 100).toString())
  }, [settings])

  const saveFee = useMutation({
    mutationFn: () => {
      const percent = Number.parseFloat(feeInput)
      if (!Number.isFinite(percent) || percent < 0 || percent > 30) {
        throw new Error('Enter a fee between 0 and 30 percent')
      }
      return adminSetFeeBps(Math.round(percent * 100))
    },
    onSuccess: () => {
      toast.success('Fee updated — it applies to new checkouts immediately')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-actions'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <LoadingBlock />
  if (error) return <ErrorNote error={error} />
  if (!settings) return null

  const preview = Number.parseFloat(feeInput)
  const previewCents = Number.isFinite(preview) ? Math.round(10000 * (preview / 100)) : 0

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <h2 className="font-semibold">Platform fee</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Your cut of the item price on every completed sale. Shipping is passed through
          in full and never has a fee taken from it.
        </p>

        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); saveFee.mutate() }}
        >
          <div>
            <label className="label" htmlFor="fee">Fee percent</label>
            <input
              id="fee"
              className="input w-32"
              inputMode="decimal"
              value={feeInput}
              onChange={(e) => setFeeInput(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={saveFee.isPending}>
            {saveFee.isPending ? 'Saving…' : 'Save fee'}
          </Button>
        </form>

        {previewCents > 0 && (
          <p className="hint">
            On a {money(10000)} item you would keep {money(previewCents)} and the seller
            would receive {money(10000 - previewCents)} before Stripe's own fees.
          </p>
        )}

        <p className="mt-3 rounded-xl bg-panel2 px-3 py-2 text-xs text-fg-muted   ">
          This is the only place the fee is configured. The seller's estimate on the
          listing form and the amount create-checkout actually charges both read this
          value, so they cannot drift apart.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold">Terms version</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Currently <strong>{settings.terms_version}</strong>. Bumping this forces every
          member to read and accept again before they can next list, offer, or buy.
        </p>
        <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-xs text-fg-muted">
          Changing it is deliberately not a button. Edit the documents in
          <code className="mx-1">src/legal/</code>, update the version line in each, deploy,
          and only then update <code className="mx-1">platform_settings.terms_version</code>{' '}
          in SQL — in that order, so nobody is asked to accept a version they cannot read yet.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold">Recent admin actions</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Append-only. Nothing here, including this console, can edit or delete a row.
        </p>

        {!actions?.length ? (
          <p className="mt-3 text-sm text-fg-subtle">Nothing yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {actions.map((action) => (
              <li key={action.id} className="flex flex-wrap justify-between gap-2 border-b border-line/10 pb-2 ">
                <span>
                  <strong>{action.admin?.display_name ?? 'An admin'}</strong>{' '}
                  {action.action.replace(/_/g, ' ')} on {action.target_type}
                  {action.detail && <span className="text-fg-subtle"> — {action.detail}</span>}
                </span>
                <span className="text-xs text-fg-subtle">{timeAgo(action.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
