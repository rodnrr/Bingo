import { Link } from 'react-router-dom'
import { ImageOff } from 'lucide-react'
import { money, timeAgo } from '@/lib/format'
import { CONDITION_LABELS, type Listing } from '@/types'

export default function ListingCard({ listing }: { listing: Listing }) {
  const photo = listing.photos?.[0]
  const sold = listing.status === 'sold'

  return (
    <Link
      to={`/listing/${listing.id}`}
      className="card-hover group flex flex-col overflow-hidden !p-0"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-panel2">
        {photo ? (
          <img
            src={photo.url}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-fg-subtle">
            <ImageOff className="h-7 w-7" />
          </div>
        )}

        {/* Keeps the price legible over a bright photo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 opacity-70"
          style={{ background: 'linear-gradient(to top, rgb(var(--panel)), transparent)' }}
        />

        <span className="badge-neutral absolute left-2 top-2 bg-panel/85 backdrop-blur-sm">
          {CONDITION_LABELS[listing.condition]}
        </span>

        {sold && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/70 backdrop-blur-[1px]">
            <span className="badge-danger bg-panel px-3 py-1 text-xs">Sold</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-fg">
          {listing.title}
        </h3>

        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <p className="num text-lg font-medium text-fg">
            {money(listing.price_cents, listing.currency)}
          </p>
          <p className="num text-[10px] uppercase tracking-micro text-fg-subtle">
            {listing.shipping_cents > 0
              ? `+${money(listing.shipping_cents, listing.currency)}`
              : 'Free ship'}
          </p>
        </div>

        <p className="font-mono text-[10px] uppercase tracking-micro text-fg-subtle">
          {timeAgo(listing.created_at)}
        </p>
      </div>
    </Link>
  )
}
