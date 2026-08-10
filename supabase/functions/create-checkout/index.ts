// ================================================================
// Been-go! — create-checkout
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
// Ordering matters here. Stock is reserved BEFORE the Stripe session
// exists, because the alternative — decrementing after payment — lets
// two buyers pay for the same last item. Everything after the
// reservation is wrapped so that a failure gives the stock back.
//
// Required secrets: STRIPE_SECRET_KEY. Optional: APP_URL.
// (The fee now comes from platform_settings, not an env var.)
// ================================================================

import { handler, json, serviceClient, requireUser, stripe, APP_URL, HttpError } from '../_shared/lib.ts'

Deno.serve(handler(async (req) => {
  const db = serviceClient()
  const { user, profile } = await requireUser(req, db, { requireTerms: true })

  const body = await req.json().catch(() => ({}))
  const listingId: string | undefined = body.listing_id
  const offerId: string | null = body.offer_id ?? null
  const quantity = Math.max(1, Math.min(Number(body.quantity ?? 1) || 1, 10))

  if (!listingId) throw new HttpError(400, 'Missing listing_id')

  // ── Read the listing and its seller ────────────────────────────
  const { data: listing } = await db
    .from('listings')
    .select('*, seller:profiles!listings_seller_id_fkey(id, display_name, status, stripe_account_id, stripe_charges_enabled)')
    .eq('id', listingId)
    .single()

  if (!listing) throw new HttpError(404, 'That listing no longer exists')
  if (listing.status !== 'active') throw new HttpError(409, 'That listing is no longer for sale')
  if (listing.seller_id === profile.id) throw new HttpError(400, 'You cannot buy your own listing')

  const seller = listing.seller
  if (!seller || seller.status !== 'active') {
    throw new HttpError(409, 'This seller is not currently active on Been-go!')
  }
  if (!seller.stripe_account_id || !seller.stripe_charges_enabled) {
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

    // Re-checked here rather than trusted to the sweeper: an accepted
    // offer is a held price, and holding a price forever is exactly the
    // thing the deadline exists to prevent.
    if (offer.pay_by && new Date(offer.pay_by) < new Date()) {
      throw new HttpError(409, 'That accepted offer has expired — make a new offer')
    }

    unitCents = offer.amount_cents
  }

  // ── Fee, from the one place it is configured ───────────────────
  const { data: feeBps, error: feeErr } = await db.rpc('current_fee_bps')
  if (feeErr || feeBps === null) throw new HttpError(500, 'Could not read platform settings')

  const itemCents     = unitCents * quantity
  const shippingCents = listing.shipping_cents ?? 0
  const totalCents    = itemCents + shippingCents

  // Fee is taken on the goods, not the postage — charging a cut of
  // shipping is how marketplaces end up with angry sellers.
  const feeCents = Math.round((itemCents * Number(feeBps)) / 10000)

  // ── Reserve the stock ──────────────────────────────────────────
  // Single conditional UPDATE inside the database: of two concurrent
  // buyers for the last item, exactly one gets here.
  const { error: reserveErr } = await db.rpc('reserve_listing_stock', {
    p_listing_id: listing.id,
    p_qty: quantity,
  })

  if (reserveErr) throw new HttpError(409, 'Not enough of those left')

  // From this point the stock is held, so every failure path has to
  // give it back.
  const giveBack = async () => {
    await db.rpc('release_listing_stock', { p_listing_id: listing.id, p_qty: quantity })
  }

  try {
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

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lineItems,
        customer_email: user.email,
        shipping_address_collection: { allowed_countries: ['US', 'CA'] },
        payment_intent_data: {
          application_fee_amount: feeCents,
          transfer_data: { destination: seller.stripe_account_id },
          statement_descriptor_suffix: 'BEENGO',
        },
        // order_id is the only thing the webhook needs; it re-reads
        // everything else from our own tables.
        metadata: { order_id: order.id, listing_id: listing.id },
        success_url: `${APP_URL}/orders/return?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP_URL}/listing/${listing.id}?checkout=cancelled&order=${order.id}`,
        // Must stay well under release_stale_reservations()'s 60-minute
        // cutoff, so the sweeper can only ever act on sessions Stripe
        // has already abandoned.
        expires_at: Math.floor(Date.now() / 1000) + 60 * 30,
      })

      await db
        .from('orders')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', order.id)

      return json({ url: session.url, order_id: order.id })
    } catch (stripeErr) {
      // Stripe refused. The order exists and holds stock nobody can pay
      // for, so retire both rather than leaving a phantom reservation.
      await db.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
      throw stripeErr
    }
  } catch (err) {
    await giveBack()
    if (err instanceof HttpError) throw err
    console.error('Checkout failed after reserving stock:', err)
    throw new HttpError(502, 'Could not open checkout — nothing was charged')
  }
}))
