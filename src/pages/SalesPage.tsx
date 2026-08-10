import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { markShipped, mySales } from '@/lib/api'
import { money, timeAgo } from '@/lib/format'
import { useAuthStore, toast } from '@/lib/store'
import {
  Button, Card, Container, EmptyState, ErrorNote, LoadingBlock, PageHeading,
} from '@/components/ui'
import { ORDER_STATUS_LABELS, type ShipTo } from '@/types'

function addressLines(ship: ShipTo | null): string[] {
  if (!ship) return []
  const a = ship.address
  return [
    ship.name ?? '',
    a?.line1 ?? '',
    a?.line2 ?? '',
    [a?.city, a?.state, a?.postal_code].filter(Boolean).join(', '),
    a?.country ?? '',
  ].filter(Boolean)
}

export default function SalesPage() {
  const { userId } = useAuthStore()
  const queryClient = useQueryClient()
  const [tracking, setTracking] = useState<Record<string, { carrier: string; number: string }>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['sales', userId],
    queryFn: () => mySales(userId!),
    enabled: Boolean(userId),
  })

  const ship = useMutation({
    mutationFn: ({ orderId }: { orderId: string }) => {
      const t = tracking[orderId]
      return markShipped(orderId, t?.carrier, t?.number)
    },
    onSuccess: () => {
      toast.success('Buyer notified — marked as shipped')
      queryClient.invalidateQueries({ queryKey: ['sales', userId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const setTrack = (orderId: string, patch: Partial<{ carrier: string; number: string }>) =>
    setTracking((t) => ({
      ...t,
      [orderId]: { ...(t[orderId] ?? { carrier: '', number: '' }), ...patch },
    }))

  return (
    <Container>
      <PageHeading
        title="Sales"
        subtitle="Paid orders waiting on you, and everything already sent."
        action={<Button to="/account" variant="secondary">Payouts</Button>}
      />

      {error && <ErrorNote error={error} />}

      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState
          title="No sales yet"
          body="When someone buys one of your listings, it lands here with their shipping address."
          action={<Button to="/sell">List something</Button>}
        />
      ) : (
        <div className="space-y-3">
          {data.map((order) => {
            const lines = addressLines(order.ship_to)
            return (
              <Card key={order.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/listing/${order.listing_id}`}
                      className="font-medium hover:text-primary-600"
                    >
                      {order.listing?.title ?? 'Listing'}
                    </Link>
                    <p className="text-xs text-gray-500">
                      to {order.buyer?.display_name ?? 'a member'} · {timeAgo(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">
                      {money(order.total_cents - order.fee_cents, order.currency)}
                    </p>
                    <p className="text-xs text-gray-500">
                      after {money(order.fee_cents, order.currency)} fee
                    </p>
                    <span className="badge-neutral">{ORDER_STATUS_LABELS[order.status]}</span>
                  </div>
                </div>

                {lines.length > 0 && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-slate-700/50">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Ship to
                    </p>
                    {lines.map((line) => <p key={line}>{line}</p>)}
                  </div>
                )}

                {order.status === 'paid' && (
                  <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => { e.preventDefault(); ship.mutate({ orderId: order.id }) }}
                  >
                    <input
                      className="input flex-1 min-w-[120px]"
                      placeholder="Carrier (USPS…)"
                      value={tracking[order.id]?.carrier ?? ''}
                      onChange={(e) => setTrack(order.id, { carrier: e.target.value })}
                    />
                    <input
                      className="input flex-1 min-w-[160px]"
                      placeholder="Tracking number"
                      value={tracking[order.id]?.number ?? ''}
                      onChange={(e) => setTrack(order.id, { number: e.target.value })}
                    />
                    <Button type="submit" disabled={ship.isPending}>Mark shipped</Button>
                  </form>
                )}

                {order.tracking_number && (
                  <p className="text-sm text-gray-600 dark:text-slate-400">
                    Tracking: {order.tracking_carrier ?? ''} <strong>{order.tracking_number}</strong>
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </Container>
  )
}
