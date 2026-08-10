import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageOff, Truck, Package, Eye } from 'lucide-react'
import {
  getListing, recordView, startCheckout, makeOffer, offersOnListing, respondToOffer,
} from '@/lib/api'
import { money, timeAgo, parseMoney } from '@/lib/format'
import { useAuthStore, toast } from '@/lib/store'
import {
  Button, Card, Container, ErrorNote, LoadingBlock,
} from '@/components/ui'
import { CONDITION_LABELS } from '@/types'

export default function ListingDetailPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { userId } = useAuthStore()
  const queryClient = useQueryClient()

  const [activePhoto, setActivePhoto] = useState(0)
  const [offerInput, setOfferInput] = useState('')
  const [offerNote, setOfferNote] = useState('')

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => getListing(id),
    enabled: Boolean(id),
  })

  const isSeller = Boolean(listing && userId && listing.seller_id === userId)

  // Offers are only visible to the two parties, so this query is
  // meaningful for the seller (their inbox) and for a buyer (their own).
  const { data: offers } = useQuery({
    queryKey: ['offers', id],
    queryFn: () => offersOnListing(id),
    enabled: Boolean(id && userId),
  })

  useEffect(() => {
    if (id) recordView(id)
  }, [id])

  useEffect(() => {
    if (params.get('checkout') === 'cancelled') {
      toast.info('Checkout cancelled — nothing was charged.')
    }
  }, [params])

  const buy = useMutation({
    mutationFn: (offerId?: string) =>
      startCheckout({ listingId: id, offerId: offerId ?? null }),
    onSuccess: (url) => { window.location.href = url },
    onError: (err: Error) => toast.error(err.message),
  })

  const offer = useMutation({
    mutationFn: async () => {
      const cents = parseMoney(offerInput)
      if (!cents || cents < 100) throw new Error('Enter an offer of $1.00 or more')
      if (!userId) throw new Error('Sign in first')
      return makeOffer(id, userId, cents, offerNote)
    },
    onSuccess: () => {
      setOfferInput('')
      setOfferNote('')
      toast.success('Offer sent — the seller will get back to you.')
      queryClient.invalidateQueries({ queryKey: ['offers', id] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const respond = useMutation({
    mutationFn: ({ offerId, accept }: { offerId: string; accept: boolean }) =>
      respondToOffer(offerId, accept),
    onSuccess: (_data, vars) => {
      toast.success(vars.accept ? 'Offer accepted' : 'Offer declined')
      queryClient.invalidateQueries({ queryKey: ['offers', id] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <LoadingBlock />
  if (error) return <Container><ErrorNote error={error} /></Container>
  if (!listing) {
    return (
      <Container>
        <Card>
          <h1 className="text-xl font-bold">Listing not found</h1>
          <p className="mt-1 text-sm text-gray-600">
            It may have been removed. <Link to="/browse" className="text-primary-600">Back to browse</Link>
          </p>
        </Card>
      </Container>
    )
  }

  const photos = listing.photos ?? []
  const myAcceptedOffer = offers?.find(
    (o) => o.buyer_id === userId && o.status === 'accepted',
  )
  const myPendingOffer = offers?.find(
    (o) => o.buyer_id === userId && o.status === 'pending',
  )
  const pendingForSeller = isSeller ? offers?.filter((o) => o.status === 'pending') ?? [] : []

  const total = listing.price_cents + listing.shipping_cents

  return (
    <Container>
      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── Photos ── */}
        <div>
          <div className="aspect-square w-full overflow-hidden rounded-2xl bg-gray-100 dark:bg-slate-800">
            {photos[activePhoto] ? (
              <img
                src={photos[activePhoto].url}
                alt={listing.title}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-gray-400">
                <ImageOff className="h-10 w-10" />
              </div>
            )}
          </div>

          {photos.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  onClick={() => setActivePhoto(i)}
                  className={
                    'h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ' +
                    (i === activePhoto ? 'border-primary-600' : 'border-transparent')
                  }
                >
                  <img src={photo.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Detail ── */}
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{listing.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="badge-neutral">{CONDITION_LABELS[listing.condition]}</span>
              {listing.status === 'sold' && <span className="badge-danger">Sold</span>}
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" /> {listing.view_count}
              </span>
              <span>· listed {timeAgo(listing.created_at)}</span>
            </div>
          </div>

          <div>
            <p className="text-3xl font-bold">{money(listing.price_cents, listing.currency)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-400">
              <Truck className="h-4 w-4" />
              {listing.shipping_cents > 0
                ? `${money(listing.shipping_cents, listing.currency)} shipping — ${money(total, listing.currency)} total`
                : 'Free shipping'}
            </p>
            {listing.ships_from && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-400">
                <Package className="h-4 w-4" /> Ships from {listing.ships_from}
              </p>
            )}
          </div>

          {/* ── Buyer actions ── */}
          {!isSeller && listing.status === 'active' && (
            <Card className="space-y-3">
              {myAcceptedOffer ? (
                <>
                  <p className="text-sm font-medium text-success-600">
                    Your offer of {money(myAcceptedOffer.amount_cents)} was accepted.
                  </p>
                  <Button
                    fullWidth
                    size="lg"
                    disabled={buy.isPending}
                    onClick={() => buy.mutate(myAcceptedOffer.id)}
                  >
                    {buy.isPending ? 'Opening checkout…' : `Pay ${money(myAcceptedOffer.amount_cents + listing.shipping_cents)}`}
                  </Button>
                </>
              ) : (
                <Button
                  fullWidth
                  size="lg"
                  disabled={buy.isPending}
                  onClick={() => buy.mutate(undefined)}
                >
                  {buy.isPending ? 'Opening checkout…' : 'Buy it now'}
                </Button>
              )}

              {listing.allow_offers && !myAcceptedOffer && (
                myPendingOffer ? (
                  <p className="text-center text-sm text-gray-600 dark:text-slate-400">
                    Offer of {money(myPendingOffer.amount_cents)} sent — waiting on the seller.
                  </p>
                ) : (
                  <form
                    className="space-y-2 border-t border-gray-200 pt-3 dark:border-slate-700"
                    onSubmit={(e) => { e.preventDefault(); offer.mutate() }}
                  >
                    <label className="label" htmlFor="offer">Make an offer</label>
                    <div className="flex gap-2">
                      <input
                        id="offer"
                        className="input"
                        inputMode="decimal"
                        placeholder="$0.00"
                        value={offerInput}
                        onChange={(e) => setOfferInput(e.target.value)}
                      />
                      <Button type="submit" variant="secondary" disabled={offer.isPending}>
                        Send
                      </Button>
                    </div>
                    <input
                      className="input"
                      placeholder="Optional note to the seller"
                      value={offerNote}
                      onChange={(e) => setOfferNote(e.target.value)}
                    />
                  </form>
                )
              )}
            </Card>
          )}

          {isSeller && (
            <Card className="space-y-3">
              <p className="text-sm font-medium">This is your listing.</p>
              <Button to={`/sell/${listing.id}`} variant="secondary" fullWidth>
                Edit listing
              </Button>

              {pendingForSeller.length > 0 && (
                <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-slate-700">
                  <p className="text-sm font-semibold">
                    {pendingForSeller.length} pending offer{pendingForSeller.length > 1 ? 's' : ''}
                  </p>
                  {pendingForSeller.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-2 text-sm">
                      <div>
                        <p className="font-medium">{money(o.amount_cents)}</p>
                        <p className="text-xs text-gray-500">
                          {o.buyer?.display_name ?? 'A member'} · {timeAgo(o.created_at)}
                        </p>
                        {o.message && <p className="mt-0.5 text-xs italic text-gray-600">"{o.message}"</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          disabled={respond.isPending}
                          onClick={() => respond.mutate({ offerId: o.id, accept: true })}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={respond.isPending}
                          onClick={() => respond.mutate({ offerId: o.id, accept: false })}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {listing.description && (
            <div>
              <h2 className="mb-1 font-semibold">Description</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-slate-300">
                {listing.description}
              </p>
            </div>
          )}

          <p className="text-sm text-gray-500">
            Sold by <strong>{listing.seller?.display_name ?? 'a member'}</strong>
          </p>
        </div>
      </div>
    </Container>
  )
}
