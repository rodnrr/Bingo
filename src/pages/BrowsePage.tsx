import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import clsx from 'clsx'
import { browseListings, listCategories } from '@/lib/api'
import { parseMoney } from '@/lib/format'
import ListingCard from '@/components/marketplace/ListingCard'
import {
  Button, Container, EmptyState, ErrorNote, LoadingBlock, PageHeading,
} from '@/components/ui'

export default function BrowsePage() {
  const [params, setParams] = useSearchParams()

  const q        = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const minParam = params.get('min') ?? ''
  const maxParam = params.get('max') ?? ''

  // Local state for the search box so typing does not refetch on every
  // keystroke; the URL updates on submit, and the URL is what queries key on.
  const [draft, setDraft] = useState(q)

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
    staleTime: 1000 * 60 * 60,
  })

  const minCents = minParam ? parseMoney(minParam) ?? undefined : undefined
  const maxCents = maxParam ? parseMoney(maxParam) ?? undefined : undefined

  const { data: listings, isLoading, error } = useQuery({
    queryKey: ['listings', q, category, minCents, maxCents],
    queryFn: () => browseListings({ q, category: category || undefined, minCents, maxCents }),
  })

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const hasFilters = Boolean(q || category || minParam || maxParam)

  return (
    <Container>
      <PageHeading
        title="Browse"
        subtitle="Everything listed by members right now."
        action={<Button to="/sell">Sell something</Button>}
      />

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); setParam('q', draft.trim()) }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search listings…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Search listings"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setParam('category', '')}
          className={clsx(
            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            !category
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          All
        </button>

        {categories?.map((c) => (
          <button
            key={c.slug}
            onClick={() => setParam('category', c.slug === category ? '' : c.slug)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              c.slug === category
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            {c.name}
          </button>
        ))}

        {hasFilters && (
          <button
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {error && <ErrorNote error={error} />}

      {isLoading ? (
        <LoadingBlock />
      ) : !listings?.length ? (
        <EmptyState
          title={hasFilters ? 'Nothing matched' : 'Nothing listed yet'}
          body={
            hasFilters
              ? 'Try a broader search, or clear the filters.'
              : 'Be the first — list something and it shows up here immediately.'
          }
          action={<Button to="/sell">Create a listing</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </Container>
  )
}
