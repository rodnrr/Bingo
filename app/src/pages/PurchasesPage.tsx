import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmDelivery, myPurchases } from '@/lib/api'
import { money, timeAgo } from '@/lib/format'
import { useAuthStore, toast } from '@/lib/store'
import {
  Button, Card, Container, EmptyState, ErrorNote, LoadingBlock, PageHeading,
} from '@/components/ui'
import { ORDER_STATUS_LABELS } from '@/types'

export default function PurchasesPage() {
  const { userId } = useAuthStore()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['purchases', userId],
    queryFn: () => myPurchases(userId!),
    enabled: Boolean(userId),
  })

  const confirm = useMutation({
    mutationFn: (orderId: string) => confirmDelivery(orderId),
    onSuccess: () => {
      toast.success('Marked as delivered')
      queryClient.invalidateQueries({ queryKey: ['purchases', userId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Container>
      <PageHeading title="Purchases" subtitle="Everything you have bought on RiseBay." />

      {error && <ErrorNote error={error} />}

      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState
          title="Nothing bought yet"
          body="When you buy something, the order and its tracking show up here."
          action={<Button to="/browse">Browse listings</Button>}
        />
      ) : (
        <div className="space-y-3">
          {data.map((order) => (
            <Card key={order.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/listing/${order.listing_id}`}
                    className="font-medium hover:text-primary-600"
                  >
                    {order.listing?.title ?? 'Listing'}
                  </Link>
                  <p className="text-xs text-gray-500">
                    from {order.seller?.display_name ?? 'a member'} · {timeAgo(order.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{money(order.total_cents, order.currency)}</p>
                  <span className="badge-neutral">{ORDER_STATUS_LABELS[order.status]}</span>
                </div>
              </div>

              {order.tracking_number && (
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Tracking: {order.tracking_carrier ?? ''} <strong>{order.tracking_number}</strong>
                </p>
              )}

              {order.status === 'shipped' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate(order.id)}
                >
                  It arrived
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </Container>
  )
}
