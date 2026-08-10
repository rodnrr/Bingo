import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import {
  createListing, getListing, listCategories, updateListing, removeListing,
  type ListingDraft,
} from '@/lib/api'
import { money, parseMoney } from '@/lib/format'
import { useAuthStore, canSell, toast } from '@/lib/store'
import PhotoUploader from '@/components/marketplace/PhotoUploader'
import {
  Button, Card, Container, ErrorNote, LoadingBlock, PageHeading,
} from '@/components/ui'
import { CONDITION_LABELS, type ListingCondition } from '@/types'

const FEE_BPS = 800   // mirror of MARKETPLACE_FEE_BPS, for the estimate only

interface FormState {
  title: string
  description: string
  category_slug: string
  condition: ListingCondition
  price: string
  shipping: string
  quantity: string
  allow_offers: boolean
  ships_from: string
}

const EMPTY: FormState = {
  title: '', description: '', category_slug: '', condition: 'good',
  price: '', shipping: '', quantity: '1', allow_offers: true, ships_from: '',
}

export default function SellPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { userId, profile } = useAuthStore()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
    staleTime: 1000 * 60 * 60,
  })

  const { data: existing, isLoading } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => getListing(id!),
    enabled: Boolean(id),
  })

  useEffect(() => {
    if (!existing) return
    setForm({
      title:         existing.title,
      description:   existing.description,
      category_slug: existing.category_slug ?? '',
      condition:     existing.condition,
      price:         (existing.price_cents / 100).toFixed(2),
      shipping:      existing.shipping_cents ? (existing.shipping_cents / 100).toFixed(2) : '',
      quantity:      String(existing.quantity),
      allow_offers:  existing.allow_offers,
      ships_from:    existing.ships_from ?? '',
    })
  }, [existing])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  /** Validate once, here, so both save paths get the same rules. */
  const toDraft = (status: 'draft' | 'active'): ListingDraft => {
    const priceCents = parseMoney(form.price)
    if (!priceCents || priceCents < 100) throw new Error('Price must be at least $1.00')
    if (form.title.trim().length < 3) throw new Error('Give it a title of at least 3 characters')

    const quantity = Math.max(1, Number.parseInt(form.quantity, 10) || 1)

    return {
      title:          form.title.trim(),
      description:    form.description.trim(),
      category_slug:  form.category_slug || null,
      condition:      form.condition,
      price_cents:    priceCents,
      shipping_cents: form.shipping ? parseMoney(form.shipping) ?? 0 : 0,
      quantity,
      allow_offers:   form.allow_offers,
      ships_from:     form.ships_from.trim() || null,
      status,
    }
  }

  const save = useMutation({
    mutationFn: async (status: 'draft' | 'active') => {
      if (!userId) throw new Error('Sign in first')
      const draft = toDraft(status)
      return id ? updateListing(id, draft) : createListing(userId, draft)
    },
    onSuccess: (listing, status) => {
      queryClient.invalidateQueries({ queryKey: ['listings'] })
      queryClient.invalidateQueries({ queryKey: ['my-listings'] })
      toast.success(status === 'active' ? 'Listing is live' : 'Draft saved')

      // A new listing needs photos, and photos need the row to exist —
      // so a fresh create lands on its own edit page rather than away.
      if (!id) navigate(`/sell/${listing.id}`, { replace: true })
    },
    onError: (err: Error) => setError(err.message),
  })

  const drop = useMutation({
    mutationFn: () => removeListing(id!),
    onSuccess: () => {
      toast.success('Listing removed')
      navigate('/listings')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (id && isLoading) return <LoadingBlock />

  const priceCents = parseMoney(form.price) ?? 0
  const feeCents   = Math.round((priceCents * FEE_BPS) / 10000)
  const payoutCents = Math.max(0, priceCents - feeCents)

  return (
    <Container className="max-w-2xl">
      <PageHeading
        title={id ? 'Edit listing' : 'New listing'}
        subtitle={id ? undefined : 'Save it as a draft first, then add photos.'}
      />

      {!canSell(profile) && (
        <Card className="mb-4 border border-warning-500/30 bg-warning-50">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning-600" />
            <div>
              <p className="font-semibold text-warning-600">Payouts not set up yet</p>
              <p className="mt-1 text-sm text-gray-700">
                You can write and save a listing now, but buyers cannot check out until Stripe
                has your bank details. It takes about two minutes.
              </p>
              <Button to="/account" variant="secondary" size="sm" className="mt-3">
                Set up payouts
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-4">
        {error && <ErrorNote error={new Error(error)} />}

        <div>
          <label className="label" htmlFor="title">Title</label>
          <input
            id="title"
            className="input"
            maxLength={140}
            placeholder="What are you selling?"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea
            id="description"
            className="input min-h-[120px]"
            placeholder="Condition, flaws, what's included, why you're selling it."
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="category">Category</label>
            <select
              id="category"
              className="input"
              value={form.category_slug}
              onChange={(e) => set('category_slug', e.target.value)}
            >
              <option value="">Choose one</option>
              {categories?.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="condition">Condition</label>
            <select
              id="condition"
              className="input"
              value={form.condition}
              onChange={(e) => set('condition', e.target.value as ListingCondition)}
            >
              {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="price">Price</label>
            <input
              id="price"
              className="input"
              inputMode="decimal"
              placeholder="$0.00"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="shipping">Shipping</label>
            <input
              id="shipping"
              className="input"
              inputMode="decimal"
              placeholder="Leave blank for free"
              value={form.shipping}
              onChange={(e) => set('shipping', e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="quantity">Quantity</label>
            <input
              id="quantity"
              className="input"
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="ships_from">Ships from</label>
            <input
              id="ships_from"
              className="input"
              placeholder="City, State"
              value={form.ships_from}
              onChange={(e) => set('ships_from', e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600"
            checked={form.allow_offers}
            onChange={(e) => set('allow_offers', e.target.checked)}
          />
          Let buyers make offers
        </label>

        {priceCents > 0 && (
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-slate-700/50">
            <p className="flex justify-between">
              <span>Item price</span><span>{money(priceCents)}</span>
            </p>
            <p className="flex justify-between text-gray-600 dark:text-slate-400">
              <span>RiseBay fee ({FEE_BPS / 100}%)</span><span>−{money(feeCents)}</span>
            </p>
            <p className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold dark:border-slate-600">
              <span>You receive</span><span>{money(payoutCents)}</span>
            </p>
            <p className="hint">Shipping is passed through in full — no fee on postage.</p>
          </div>
        )}
      </Card>

      {/* Photos need a saved listing to attach to. */}
      {id && existing && userId && (
        <Card className="mt-4">
          <h2 className="mb-3 font-semibold">Photos</h2>
          <PhotoUploader
            userId={userId}
            listingId={id}
            photos={existing.photos ?? []}
            onChange={() => queryClient.invalidateQueries({ queryKey: ['listing', id] })}
          />
        </Card>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={save.isPending} onClick={() => save.mutate('active')}>
          {save.isPending ? 'Saving…' : id ? 'Save and publish' : 'Publish'}
        </Button>
        <Button
          variant="secondary"
          disabled={save.isPending}
          onClick={() => save.mutate('draft')}
        >
          Save as draft
        </Button>
        {id && (
          <Button
            variant="ghost"
            className="ml-auto text-danger-600"
            disabled={drop.isPending}
            onClick={() => {
              if (confirm('Remove this listing? Buyers will no longer see it.')) drop.mutate()
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </Container>
  )
}
