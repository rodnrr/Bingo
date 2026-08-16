import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { myOffers, respondToOffer, withdrawOffer } from '@/lib/api'
import { money, timeAgo } from '@/lib/format'
import { useAuthStore, toast } from '@/lib/store'
import {
  Button, Card, Container, EmptyState, ErrorNote, LoadingBlock, PageHeading,
} from '@/components/ui'
import type { Offer, OfferStatus } from '@/types'

const STATUS_CLASS: Record<OfferStatus, string> = {
  pending:   'badge-warning',
  accepted:  'badge-success',
  declined:  'badge-neutral',
  withdrawn: 'badge-neutral',
  expired:   'badge-neutral',
}

/**
 * One query, split in the client. RLS already scopes `offers` to rows
 * where the viewer is the buyer or the seller, so a single select
 * returns exactly the two lists this page shows.
 */
export default function OffersPage() {
  const { userId } = useAuthStore()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-offers', userId],
    queryFn: myOffers,
    enabled: Boolean(userId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-offers', userId] })

  const respond = useMutation({
    mutationFn: ({ offerId, accept }: { offerId: string; accept: boolean }) =>
      respondToOffer(offerId, accept),
    onSuccess: (_d, v) => { toast.success(v.accept ? 'Offer accepted' : 'Offer declined'); invalidate() },
    onError: (err: Error) => toast.error(err.message),
  })

  const withdraw = useMutation({
    mutationFn: (offerId: string) => withdrawOffer(offerId),
    onSuccess: () => { toast.success('Offer withdrawn'); invalidate() },
    onError: (err: Error) => toast.error(err.message),
  })

  const received = data?.filter((o) => o.buyer_id !== userId) ?? []
  const sent     = data?.filter((o) => o.buyer_id === userId) ?? []

  const row = (offer: Offer, side: 'received' | 'sent') => (
    <Card key={offer.id} className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Link
          to={`/listing/${offer.listing_id}`}
          className="font-medium hover:text-primary"
        >
          {offer.listing?.title ?? 'Listing'}
        </Link>
        <p className="text-xs text-fg-subtle">
          {side === 'received'
            ? `${offer.buyer?.display_name ?? 'A member'} offered`
            : 'You offered'}{' '}
          <strong>{money(offer.amount_cents)}</strong>
          {offer.listing && <> · asking {money(offer.listing.price_cents)}</>}
          {' · '}{timeAgo(offer.created_at)}
        </p>
        {offer.message && (
          <p className="mt-1 text-sm italic text-fg-muted">"{offer.message}"</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className={STATUS_CLASS[offer.status]}>{offer.status}</span>

        {offer.status === 'pending' && side === 'received' && (
          <>
            <Button size="sm" disabled={respond.isPending}
              onClick={() => respond.mutate({ offerId: offer.id, accept: true })}>
              Accept
            </Button>
            <Button size="sm" variant="ghost" disabled={respond.isPending}
              onClick={() => respond.mutate({ offerId: offer.id, accept: false })}>
              Decline
            </Button>
          </>
        )}

        {offer.status === 'pending' && side === 'sent' && (
          <Button size="sm" variant="ghost" disabled={withdraw.isPending}
            onClick={() => withdraw.mutate(offer.id)}>
            Withdraw
          </Button>
        )}

        {offer.status === 'accepted' && side === 'sent' && (
          <Button size="sm" to={`/listing/${offer.listing_id}`}>Pay now</Button>
        )}
      </div>
    </Card>
  )

  return (
    <Container>
      <PageHeading title="Offers" subtitle="Offers you have received and offers you have sent." />

      {error && <ErrorNote error={error} />}

      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState
          title="No offers yet"
          body="Offers on your listings, and offers you make on other people's, both show up here."
          action={<Button to="/browse">Browse listings</Button>}
        />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-subtle">
              Received ({received.length})
            </h2>
            {received.length ? (
              <div className="space-y-2">{received.map((o) => row(o, 'received'))}</div>
            ) : (
              <p className="text-sm text-fg-subtle">Nothing yet.</p>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-subtle">
              Sent ({sent.length})
            </h2>
            {sent.length ? (
              <div className="space-y-2">{sent.map((o) => row(o, 'sent'))}</div>
            ) : (
              <p className="text-sm text-fg-subtle">Nothing yet.</p>
            )}
          </section>
        </div>
      )}
    </Container>
  )
}
