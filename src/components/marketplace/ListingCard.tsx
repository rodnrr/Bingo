import { Link } from 'react-router-dom'
import { ImageOff } from 'lucide-react'
import { money, timeAgo } from '@/lib/format'
import { CONDITION_LABELS, type Listing } from '@/types'

export default function ListingCard({ listing }: { listing: Listing }) {
  const photo = listing.photos?.[0]

  return (
    <Link
      to={`/listing/${listing.id}`}
      className="card-hover group flex flex-col overflow-hidden !p-0"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-100 dark:bg-slate-700">
        {photo ? (
          <img
            src={photo.url}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <ImageOff className="h-8 w-8" />
          </div>
        )}

        {listing.status === 'sold' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rounded-full bg-white px-4 py-1 text-sm font-bold uppercase tracking-wide">
              Sold
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</h3>

        <p className="mt-auto pt-1 text-lg font-bold">
          {money(listing.price_cents, listing.currency)}
        </p>

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <span>{CONDITION_LABELS[listing.condition]}</span>
          <span>
            {listing.shipping_cents > 0
              ? `+ ${money(listing.shipping_cents, listing.currency)} ship`
              : 'Free ship'}
          </span>
        </div>

        <p className="text-xs text-gray-400">{timeAgo(listing.created_at)}</p>
      </div>
    </Link>
  )
}
