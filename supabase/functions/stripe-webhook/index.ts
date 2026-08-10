// ================================================================
// Been-go — stripe-webhook
//
// The only writer of "this order is paid". Nothing in the browser can
// reach that state, which is the whole reason this function exists.
//
// Three things it is careful about:
//
// 1. Signature first. The body is parsed only after
//    constructEventAsync verifies it against STRIPE_WEBHOOK_SECRET —
//    otherwise this URL would be an open endpoint for marking any
//    order paid.
// 2. Idempotency. Stripe retries, and retries can arrive out of order
//    or twice. Every update is conditioned on the state it expects to
//    be moving away from, so a duplicate delivery changes nothing.
// 3. It returns 200 for events it does not handle. A non-2xx tells
//    Stripe to retry forever.
//
// Deploy WITHOUT the JWT gate — Stripe does not send Supabase auth:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// Required secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// ================================================================

import { CORS, json, serviceClient, stripe } from '../_shared/lib.ts'

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const signature = req.headers.get('stripe-signature')
  if (!signature) return json({ error: 'Missing signature' }, 400)

  // Raw text, not req.json() — signature verification is over the exact bytes.
  const raw = await req.text()

  let event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, WEBHOOK_SECRET)
  } catch (err) {
    console.error('Signature verification failed:', err)
    return json({ error: 'Invalid signature' }, 400)
  }

  const db = serviceClient()

  switch (event.type) {
    // ── Payment went through ─────────────────────────────────────
    case 'checkout.session.completed': {
      const session = event.data.object as {
        id: string
        payment_intent: string | null
        payment_status: string
        metadata: Record<string, string> | null
        shipping_details?: unknown
        customer_details?: { name?: string | null; email?: string | null }
      }

      if (session.payment_status !== 'paid') break

      const orderId = session.metadata?.order_id
      if (!orderId) {
        console.error('checkout.session.completed with no order_id metadata', session.id)
        break
      }

      // .eq('status', 'pending_payment') is the idempotency guard: a
      // replayed event matches zero rows instead of re-running the
      // inventory decrement below.
      const { data: order } = await db
        .from('orders')
        .update({
          status:                   'paid',
          paid_at:                  new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent,
          ship_to:                  session.shipping_details ?? session.customer_details ?? null,
        })
        .eq('id', orderId)
        .eq('status', 'pending_payment')
        .select()
        .maybeSingle()

      if (!order) break   // already processed, or cancelled — nothing to do

      // Stock was already taken when checkout opened (create-checkout
      // reserves it, so two buyers cannot both pay for the last item).
      // All that remains is to close the listing if that was the last one.
      await db.rpc('settle_listing_after_sale', { p_listing_id: order.listing_id })

      // The listing's offers are now moot. Retiring them stops a seller
      // accepting an offer on something they no longer have.
      await db
        .from('offers')
        .update({ status: 'expired', responded_at: new Date().toISOString() })
        .eq('listing_id', order.listing_id)
        .eq('status', 'pending')

      break
    }

    // ── Buyer abandoned checkout ─────────────────────────────────
    // The reservation has to come back, and it has to come back exactly
    // once — hence the conditional update first, releasing stock only
    // if this delivery is the one that actually moved the row.
    case 'checkout.session.expired': {
      const session = event.data.object as { metadata: Record<string, string> | null }
      const orderId = session.metadata?.order_id
      if (!orderId) break

      const { data: order } = await db
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .eq('status', 'pending_payment')
        .select()
        .maybeSingle()

      if (order) {
        await db.rpc('release_listing_stock', {
          p_listing_id: order.listing_id,
          p_qty: order.quantity,
        })
      }
      break
    }

    // ── Refund ───────────────────────────────────────────────────
    case 'charge.refunded': {
      const charge = event.data.object as { payment_intent: string | null }
      if (!charge.payment_intent) break

      await db
        .from('orders')
        .update({ status: 'refunded' })
        .eq('stripe_payment_intent_id', charge.payment_intent)
      break
    }

    // ── Seller finished (or lost) onboarding ─────────────────────
    // These two booleans are the app's only source of truth for
    // "may this person list things for sale".
    case 'account.updated': {
      const account = event.data.object as {
        id: string
        charges_enabled: boolean
        payouts_enabled: boolean
      }

      await db
        .from('profiles')
        .update({
          stripe_charges_enabled: account.charges_enabled,
          stripe_payouts_enabled: account.payouts_enabled,
        })
        .eq('stripe_account_id', account.id)
      break
    }

    default:
      // Acknowledged and ignored on purpose.
      break
  }

  return json({ received: true })
})
