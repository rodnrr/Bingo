import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { adminListReports, adminRemoveListing, adminResolveReport } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { toast } from '@/lib/store'
import { Button, Card, EmptyState, ErrorNote, LoadingBlock } from '@/components/ui'
import { REPORT_REASON_LABELS, type ReportStatus } from '@/types'

const FILTERS: { label: string; value: ReportStatus | undefined }[] = [
  { label: 'Open',      value: 'open' },
  { label: 'Reviewing', value: 'reviewing' },
  { label: 'Actioned',  value: 'actioned' },
  { label: 'Dismissed', value: 'dismissed' },
  { label: 'All',       value: undefined },
]

const STATUS_CLASS: Record<ReportStatus, string> = {
  open:      'badge-warning',
  reviewing: 'badge-primary',
  actioned:  'badge-success',
  dismissed: 'badge-neutral',
}

export default function AdminReports() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<ReportStatus | undefined>('open')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-reports', filter],
    queryFn: () => adminListReports(filter),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
  }

  const resolve = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: ReportStatus; note?: string }) =>
      adminResolveReport(id, status, note),
    onSuccess: () => { toast.success('Report updated'); invalidate() },
    onError: (err: Error) => toast.error(err.message),
  })

  const removeListing = useMutation({
    mutationFn: ({ listingId, reason }: { listingId: string; reason: string }) =>
      adminRemoveListing(listingId, reason),
    onSuccess: () => { toast.success('Listing removed'); invalidate() },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setFilter(value)}
            className={clsx(
              'rounded px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors',
              filter === value
                ? 'bg-primary text-primary-fg'
                : 'bg-panel2 text-fg-muted hairline hover:text-fg',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <ErrorNote error={error} />}

      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState
          title="Nothing here"
          body={filter === 'open' ? 'No open reports. Good sign.' : 'No reports in this state.'}
        />
      ) : (
        <div className="space-y-3">
          {data.map((report) => (
            <Card key={report.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {REPORT_REASON_LABELS[report.reason]}
                    {report.listing && (
                      <>
                        {' — '}
                        <Link
                          to={`/listing/${report.listing.id}`}
                          className="text-primary hover:underline"
                        >
                          {report.listing.title}
                        </Link>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-fg-subtle">
                    reported by {report.reporter?.display_name ?? 'a member'} ·{' '}
                    {timeAgo(report.created_at)}
                    {report.listing?.status === 'removed' && ' · listing already removed'}
                  </p>
                </div>
                <span className={STATUS_CLASS[report.status]}>{report.status}</span>
              </div>

              {report.detail && (
                <p className="rounded-xl bg-panel2 px-3 py-2 text-sm ">
                  {report.detail}
                </p>
              )}

              {report.admin_note && (
                <p className="text-xs text-fg-subtle">Note: {report.admin_note}</p>
              )}

              {(report.status === 'open' || report.status === 'reviewing') && (
                <div className="flex flex-wrap gap-2">
                  {report.listing && report.listing.status !== 'removed' && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={removeListing.isPending}
                      onClick={() => {
                        const reason = prompt('Reason for removing this listing?')
                        if (reason === null) return
                        removeListing.mutate({ listingId: report.listing!.id, reason })
                        resolve.mutate({ id: report.id, status: 'actioned', note: reason })
                      }}
                    >
                      Remove listing
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: report.id, status: 'actioned' })}
                  >
                    Mark actioned
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={resolve.isPending}
                    onClick={() => {
                      const note = prompt('Why are you dismissing this? (optional)')
                      resolve.mutate({
                        id: report.id,
                        status: 'dismissed',
                        note: note ?? undefined,
                      })
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
