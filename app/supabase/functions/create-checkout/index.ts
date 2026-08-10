// ================================================================
// RiseBay — create-checkout
//
// Turns "I want this" into a Stripe Checkout Session, and creates the
// order row that the webhook will later promote to paid.
//
// The load-bearing property of this function: the browser sends a
// listing id and, optionally, an accepted-offer id. It never sends a
// price. Every cent is re-read from the database here, so a tampered
// request buys the same item at the same price.
//
// Money flow is a destination charge: the buyer pays the platform, the
// platform keeps application_fee_amount, and Stripe transfers the rest
// to the seller's connected account on its own payout schedule.
//
// Required secrets: STRIPE_SECRET_KEY. Optional: MARKETPLACE_FEE_BPS, APP_URL.
// ================================================================

import { handler, json, serviceClient, requireUser, stripe, APP_URL, FEE_BPS, HttpError } from '../_shared/lib.ts'

Deno.serve(handler(async (req) => {
  const db = serviceClient()
  const { user, profile } = await requireUser(req, db)

  const body = await req.json().catch(() => ({}))
  const listingId: string | undefined = body.listing_id
  const offerId: string | null = body.offer_id ?? null
  const quantity = Math.max(1, Math.min(Number(body.quantity ?? 1) || 1, 10))

  if (!listingId) throw new HttpError(400, 'Missing listing_id')

  // ── Read the listing and its seller ────────────────────────────
  const { data: listing } = await db
    .from('listings')
    .select('*, seller:profiles!listings_seller_id_fkey(id, display_name, stripe_account_id, stripe_charges_enabled)')
    .eq('id', listingId)
    .single()

  if (!listing) throw new HttpError(404, 'That listing no longer exists')
  if (listing.status !== 'active') throw new HttpError(409, 'That listing is no longer for sale')
  if (listing.seller_id === profile.id) throw new HttpError(400, 'You cannot buy your own listing')
  if (listing.quantity < quantity) throw new HttpError(409, 'Not enough of those left')

  const seller = listing.seller
  if (!seller?.stripe_account_id || !seller.stripe_charges_enabled) {
    throw new HttpError(409, 'This seller has not finished setting up payouts yet')
  }

  // ── Price: listing price, or an offer the seller actually accepted ──
  let unitCents: number = listing.price_cents

  if (offerId) {
    const { data: offer } = await db
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .eq('buyer_id', profile.id)
      .eq('listing_id', listingId)
      .eq('status', 'accepted')
      .single()

    if (!offer) throw new HttpError(409, 'No accepted offer of yours for this listing')
    unitCents = offer.amount_cents
  }

  const itemCents     = unitCents * quantity
  const shippingCents = listing.shipping_cents ?? 0
  const totalCents    = itemCents + shippingCents

  // Fee is taken on the goods, not the postage — charging a cut of
  // shipping is how marketplaces end up with angry sellers.
  const feeCents = Math.round((itemCents * FEE_BPS) / 10000)

  // ── Create the order first, in pending_payment ─────────────────
  // Before the session, so there is always a row to reconcile against
  // if Stripe succeeds and our response never reaches the browser.
  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert({
      listing_id:     listing.id,
      buyer_id:       profile.id,
      seller_id:      listing.seller_id,
      quantity,
      item_cents:     itemCents,
      shipping_cents: shippingCents,
      fee_cents:      feeCents,
      total_cents:    totalCents,
      currency:       listing.currency ?? 'usd',
      status:         'pending_payment',
    })
    .select()
    .single()

  if (orderErr || !order) throw new HttpError(500, 'Could not start your order')

  const currency = order.currency

  const lineItems = [
    {
      quantity,
      price_data: {
        currency,
        unit_amount: unitCents,
        product_data: {
          name: listing.title,
          description: (listing.description ?? '').slice(0, 300) || undefined,
        },
      },
    },
  ]

  if (shippingCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: shippingCents,
        product_data: { name: 'Shipping', description: undefined },
      },
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    customer_email: user.email,
    shipping_address_collection: { allowed_countries: ['US', 'CA'] },
    payment_intent_data: {
      application_fee_amount: feeCents,
      transfer_data: { destination: seller.stripe_account_id },
      // Shows on the buyer's card statement. Stripe caps this at 22 chars.
      statement_descriptor_suffix: 'RISEBAY',
    },
    // order_id is the only thing the webhook needs; it re-reads
    // everything else from our own tables.
    metadata: { order_id: order.id, listing_id: listing.id },
    success_url: `${APP_URL}/orders/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${APP_URL}/listing/${listing.id}?checkout=cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 30,  // 30 min
  })

  await db
    .from('orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', order.id)

  return json({ url: session.url, order_id: order.id })
}))
