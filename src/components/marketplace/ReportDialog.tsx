import { useState } from 'react'
import { Flag, X } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { reportListing } from '@/lib/api'
import { useAuthStore, toast } from '@/lib/store'
import { Button } from '@/components/ui'
import { REPORT_REASON_LABELS, type ReportReason } from '@/types'

/**
 * The report button every listing needs.
 *
 * It says "thanks, we'll look" and nothing else — never whether the
 * report was a duplicate, never what happened next. A reporter who can
 * see the outcome can also probe it, and the person reported must not
 * be able to work out who filed it.
 */
export default function ReportDialog({ listingId }: { listingId: string }) {
  const { userId } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>('prohibited_item')
  const [detail, setDetail] = useState('')

  const submit = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('Sign in first')
      return reportListing(userId, listingId, reason, detail)
    },
    onSuccess: () => {
      setOpen(false)
      setDetail('')
      toast.success('Thanks — an admin will take a look.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-fg-subtle hover:text-danger"
      >
        <Flag className="h-3.5 w-3.5" /> Report this listing
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-line/10 p-4 ">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Report this listing</h3>
        <button onClick={() => setOpen(false)} aria-label="Close" className="text-fg-subtle hover:text-fg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => { e.preventDefault(); submit.mutate() }}
      >
        <div>
          <label className="label" htmlFor="reason">What's wrong with it?</label>
          <select
            id="reason"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value as ReportReason)}
          >
            {Object.entries(REPORT_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="detail">Anything else? (optional)</label>
          <textarea
            id="detail"
            className="input min-h-[70px]"
            maxLength={1000}
            placeholder="What you saw, and why it matters."
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={submit.isPending}>
            {submit.isPending ? 'Sending…' : 'Send report'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>

        <p className="text-xs text-fg-subtle">
          The seller is not told who reported them. If you think something is stolen or
          someone is in danger, contact your local authorities first.
        </p>
      </form>
    </div>
  )
}
