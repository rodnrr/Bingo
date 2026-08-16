import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ImageOff } from 'lucide-react'
import clsx from 'clsx'
import { myListings } from '@/lib/api'
import { money, timeAgo } from '@/lib/format'
import { useAuthStore } from '@/lib/store'
import {
  Button, Card, Container, EmptyState, ErrorNote, LoadingBlock, PageHeading,
} from '@/components/ui'
import type { ListingStatus } from '@/types'

const STATUS_CLASS: Record<ListingStatus, string> = {
  draft:   'badge-neutral',
  active:  'badge-success',
  sold:    'badge-primary',
  removed: 'badge-danger',
}

export default function MyListingsPage() {
  const { userId } = useAuthStore()

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-listings', userId],
    queryFn: () => myListings(userId!),
    enabled: Boolean(userId),
  })

  return (
    <Container>
      <PageHeading
        title="Your listings"
        subtitle="Drafts, live listings, and what has sold."
        action={
          <div className="flex gap-2">
            <Button to="/offers" variant="secondary">Offers</Button>
            <Button to="/sales" variant="secondary">Sales</Button>
            <Button to="/sell">New listing</Button>
          </div>
        }
      />

      {error && <ErrorNote error={error} />}

      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState
          title="No listings yet"
          body="Sell the thing that has been sitting in the closet."
          action={<Button to="/sell">Create a listing</Button>}
        />
      ) : (
        <div className="space-y-2">
          {data.map((listing) => {
            const photo = listing.photos?.[0]
            return (
              <Card key={listing.id} className="flex items-center gap-4 !p-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-panel2">
                  {photo ? (
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                      <ImageOff className="h-5 w-5" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/listing/${listing.id}`}
                    className="line-clamp-2 font-medium hover:text-primary"
                  >
                    {listing.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                    <span className={clsx(STATUS_CLASS[listing.status])}>{listing.status}</span>
                    <span>{money(listing.price_cents, listing.currency)}</span>
                    <span>· qty {listing.quantity}</span>
                    <span>· {timeAgo(listing.created_at)}</span>
                  </div>
                </div>

                <Button to={`/sell/${listing.id}`} variant="secondary" size="sm">Edit</Button>
              </Card>
            )
          })}
        </div>
      )}
    </Container>
  )
}
