import { useState } from 'react'
import { Truck, Package, Eye, CheckCircle2, AlertTriangle } from 'lucide-react'
import ListingCard from '@/components/marketplace/ListingCard'
import { Button, Card, Chip, ChipRail, Container, PageHeading } from '@/components/ui'
import { categoryIcon, AllIcon } from '@/lib/categoryIcons'
import { money } from '@/lib/format'
import { CONDITION_LABELS, type Listing } from '@/types'

// ================================================================
// Design preview — DEV ONLY.
//
// The routes behind the invite gate cannot be looked at without a
// database, a session, and an accepted agreement. That is correct
// behaviour and a nuisance when the thing you want to change is a
// margin. This page mounts the real components with fabricated data so
// the layout can be worked on offline.
//
// It is mounted only when import.meta.env.DEV, so it is not in the
// production bundle and there is no route to it on the deployed site.
// Everything here is fake: no listing, member, or order is real.
// ================================================================

/** Flat-colour product stand-ins, so the grid reads as a grid. */
function swatch(bg: string, label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">` +
    `<rect width="400" height="400" fill="${bg}"/>` +
    `<text x="200" y="205" font-family="Inter,sans-serif" font-size="26" fill="#ffffff" ` +
    `text-anchor="middle" opacity="0.85">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const SELLER = { id: 's1', display_name: 'Marisol R.', avatar_url: null, handle: 'marisol' }

function mock(
  id: string, title: string, price: number, ship: number,
  condition: Listing['condition'], colour: string, tag: string,
  status: Listing['status'] = 'active',
): Listing {
  return {
    id, seller_id: 's1', title,
    description: 'Fabricated listing for the design preview.',
    category_slug: 'other', condition,
    price_cents: price, shipping_cents: ship, currency: 'usd',
    quantity: 1, allow_offers: true, ships_from: 'Tampa, FL',
    status, view_count: 42,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    sold_at: null,
    seller: SELLER,
    photos: [{
      id: `${id}-p`, listing_id: id, storage_path: '', url: swatch(colour, tag),
      position: 0, created_at: new Date().toISOString(),
    }],
  }
}

const LISTINGS: Listing[] = [
  mock('1', 'Fender Stratocaster, 1998 MIM, sunburst', 68000, 4500, 'good',      '#b45309', 'Guitar'),
  mock('2', 'DeWalt 20V drill + 2 batteries',           9500,     0, 'like_new',  '#0f766e', 'Drill'),
  mock('3', 'Herman Miller Aeron, size B',            42000, 12000, 'good',      '#334155', 'Chair'),
  mock('4', 'Nikon FM2 film body, meter works',       31500,  1200, 'fair',      '#7c2d12', 'Camera'),
  mock('5', 'Vitamix 5200, full jar set',             18000,  2500, 'like_new',  '#166534', 'Blender'),
  mock('6', 'Cast iron skillet, 12in, seasoned',       4500,  1800, 'good',      '#1f2937', 'Skillet'),
  mock('7', 'Vintage Levi 501, W34 L32',               7500,   900, 'good',      '#1e40af', 'Jeans'),
  mock('8', 'Trek hybrid bike, recently serviced',    24000,     0, 'good',      '#9a3412', 'Bike', 'sold'),
]

const FEE_BPS = 800

/** The real seed, so the rail is exercised at the width it ships at. */
const PREVIEW_CATEGORIES: [string, string][] = [
  ['Electronics', 'smartphone'], ['Clothing & Shoes', 'shirt'], ['Home & Garden', 'lamp'],
  ['Tools & Equipment', 'wrench'], ['Vehicles & Parts', 'car'], ['Collectibles & Art', 'palette'],
  ['Musical Instruments', 'music'], ['Sports & Outdoors', 'bike'], ['Toys & Games', 'gamepad-2'],
  ['Books & Media', 'book-open'], ['Health & Beauty', 'sparkles'], ['Everything Else', 'package'],
]

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={`num mt-1 text-2xl font-medium ${tone ?? ""}`}>{value}</p>
    </Card>
  )
}

export default function PreviewPage() {
  const hero = LISTINGS[0]
  const [offer, setOffer] = useState('600')

  const priceCents  = 68000
  const feeCents    = Math.round((priceCents * FEE_BPS) / 10000)
  const payoutCents = priceCents - feeCents

  return (
    <Container>
      <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-fg">
        <strong>Design preview — everything on this page is fake.</strong> These are the real
        components with invented data, so the screens behind the invite gate can be worked on
        without a database. This route exists only in development.
      </div>

      {/* ── Browse ── */}
      <PageHeading
        title="Browse"
        subtitle="Everything listed by members right now."
        action={<Button>Sell something</Button>}
      />

      <ChipRail className="mb-4">
        <Chip icon={AllIcon} active>All</Chip>
        {PREVIEW_CATEGORIES.map(([name, icon]) => (
          <Chip key={name} icon={categoryIcon(icon)}>{name}</Chip>
        ))}
      </ChipRail>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {LISTINGS.map((l) => <ListingCard key={l.id} listing={l} />)}
      </div>

      {/* ── Listing detail ── */}
      <h2 className="mb-4 mt-14 text-lg font-semibold uppercase tracking-wide text-fg-subtle">
        Listing detail
      </h2>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="aspect-square w-full overflow-hidden rounded-2xl bg-panel2 ">
          <img src={hero.photos![0].url} alt="" className="h-full w-full object-contain" />
        </div>

        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{hero.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-subtle">
              <span className="badge-neutral">{CONDITION_LABELS[hero.condition]}</span>
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> 42</span>
              <span>· listed 1 day ago</span>
            </div>
          </div>

          <div>
            <p className="num text-4xl font-medium tracking-tight">{money(hero.price_cents)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
              <Truck className="h-4 w-4" />
              {money(hero.shipping_cents)} shipping — {money(hero.price_cents + hero.shipping_cents)} total
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
              <Package className="h-4 w-4" /> Ships from Tampa, FL
            </p>
          </div>

          <Card className="space-y-3">
            <Button fullWidth size="lg">Buy it now</Button>

            <form className="space-y-2 border-t border-line/10 pt-3 "
                  onSubmit={(e) => e.preventDefault()}>
              <label className="label" htmlFor="pv-offer">Make an offer</label>
              <div className="flex gap-2">
                <input id="pv-offer" className="input" value={offer}
                       onChange={(e) => setOffer(e.target.value)} />
                <Button type="submit" variant="secondary">Send</Button>
              </div>
              <input className="input" placeholder="Optional note to the seller" readOnly />
            </form>
          </Card>

          <p className="text-sm text-fg-subtle">
            Sold by <strong>{SELLER.display_name}</strong>
          </p>
        </div>
      </div>

      {/* ── Seller payout breakdown ── */}
      <h2 className="mb-4 mt-14 text-lg font-semibold uppercase tracking-wide text-fg-subtle">
        What the seller sees before publishing
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-warning/30 bg-warning/10">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold text-warning">Payouts not set up yet</p>
              <p className="mt-1 text-sm text-fg-muted">
                You can write and save a listing now, but buyers cannot check out until Stripe
                has your bank details. It takes about two minutes.
              </p>
              <Button variant="secondary" size="sm" className="mt-3">Set up payouts</Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="rounded-xl bg-panel2 px-4 py-3 text-sm ">
            <p className="flex justify-between">
              <span>Item price</span><span>{money(priceCents)}</span>
            </p>
            <p className="flex justify-between text-fg-muted">
              <span>Been-go! fee ({FEE_BPS / 100}%)</span><span>−{money(feeCents)}</span>
            </p>
            <p className="mt-1 flex justify-between border-t border-line/10 pt-1 font-semibold ">
              <span>You receive</span><span>{money(payoutCents)}</span>
            </p>
            <p className="hint">Shipping is passed through in full — no fee on postage.</p>
          </div>

          <div className="mt-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            <p className="text-sm text-fg-muted">
              That percentage is read from the same row checkout charges against, so the
              estimate and the deduction cannot drift apart.
            </p>
          </div>
        </Card>
      </div>

      {/* ── Admin ── */}
      <h2 className="mb-4 mt-14 text-lg font-semibold uppercase tracking-wide text-fg-subtle">
        Admin console
      </h2>

      <ChipRail className="mb-4">
        {['Overview', 'Members', 'Reports', 'Settings'].map((t, i) => (
          <Chip key={t} active={i === 0}>{t}</Chip>
        ))}
      </ChipRail>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active members"  value="128" />
        <Stat label="Awaiting invite" value="6" />
        <Stat label="Suspended"       value="2"  tone="text-danger" />
        <Stat label="Open reports"    value="3"  tone="text-warning" />
        <Stat label="Live listings"   value="341" />
        <Stat label="Paid orders"     value="87" />
        <Stat label="Total sold"      value={money(1284300)} />
        <Stat label="Your fees"       value={money(102744)} tone="text-success" />
      </div>

      <div className="mt-14" />
    </Container>
  )
}
