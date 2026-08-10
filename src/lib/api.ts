// ================================================================
// Been-go — every database call the UI makes
//
// One module rather than one per table: the app has six tables and the
// queries are small. Pages import from here and never touch `supabase`
// directly, so when a query needs a new join there is exactly one
// place it changes.
// ================================================================

import { supabase, callFunction, PHOTO_BUCKET } from './supabase'
import type {
  Category, Invite, Listing, ListingCondition, Offer, Order, Profile,
} from '@/types'

const LISTING_SELECT = `
  *,
  photos:listing_photos(*),
  seller:profiles!listings_seller_id_fkey(id, display_name, avatar_url, handle)
`

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

/** Photos come back in insert order; the UI wants position order. */
function orderPhotos(listing: Listing): Listing {
  if (listing.photos) {
    listing.photos = [...listing.photos].sort((a, b) => a.position - b.position)
  }
  return listing
}

// ── Profile ──────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as Profile | null
}

export async function updateProfile(
  userId: string,
  patch: Pick<Partial<Profile>, 'display_name' | 'handle' | 'bio' | 'avatar_url'>,
): Promise<Profile> {
  return unwrap(
    await supabase.from('profiles').update(patch).eq('id', userId).select().single(),
  ) as Profile
}

// ── Invites ──────────────────────────────────────────────────────

export async function listInvites(): Promise<Invite[]> {
  return unwrap(
    await supabase.from('invites').select('*').order('created_at', { ascending: false }),
  ) as Invite[]
}

export async function createInvite(email?: string, note?: string): Promise<Invite> {
  return unwrap(
    await supabase.rpc('create_invite', { p_email: email ?? null, p_note: note ?? null }),
  ) as Invite
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase
    .from('invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function redeemInvite(code: string): Promise<Profile> {
  return unwrap(await supabase.rpc('redeem_invite', { p_code: code })) as Profile
}

// ── Categories ───────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  return unwrap(
    await supabase.from('categories').select('*').order('sort_order'),
  ) as Category[]
}

// ── Listings ─────────────────────────────────────────────────────

export interface BrowseArgs {
  q?: string
  category?: string
  minCents?: number
  maxCents?: number
  limit?: number
  offset?: number
}

/**
 * Browse/search. Goes through the search_listings RPC when there is a
 * text query so Postgres does the ranking; otherwise a plain filtered
 * select, which can carry the photo join that the RPC's SETOF listings
 * return type cannot.
 */
export async function browseListings(args: BrowseArgs = {}): Promise<Listing[]> {
  const { q, category, minCents, maxCents, limit = 48, offset = 0 } = args

  if (q?.trim()) {
    const ids = unwrap(
      await supabase.rpc('search_listings', {
        p_query: q.trim(),
        p_category: category ?? null,
        p_min_cents: minCents ?? null,
        p_max_cents: maxCents ?? null,
        p_limit: limit,
        p_offset: offset,
      }),
    ) as Listing[]

    if (ids.length === 0) return []

    // Re-fetch with photos, then restore the ranked order the RPC gave us.
    const rows = unwrap(
      await supabase.from('listings').select(LISTING_SELECT).in('id', ids.map((l) => l.id)),
    ) as Listing[]

    const byId = new Map(rows.map((r) => [r.id, orderPhotos(r)]))
    return ids.map((l) => byId.get(l.id)).filter((l): l is Listing => Boolean(l))
  }

  let query = supabase
    .from('listings')
    .select(LISTING_SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (category) query = query.eq('category_slug', category)
  if (minCents !== undefined) query = query.gte('price_cents', minCents)
  if (maxCents !== undefined) query = query.lte('price_cents', maxCents)

  return (unwrap(await query) as Listing[]).map(orderPhotos)
}

export async function getListing(id: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? orderPhotos(data as Listing) : null
}

export async function myListings(userId: string): Promise<Listing[]> {
  const rows = unwrap(
    await supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('seller_id', userId)
      .neq('status', 'removed')
      .order('created_at', { ascending: false }),
  ) as Listing[]

  return rows.map(orderPhotos)
}

export interface ListingDraft {
  title: string
  description: string
  category_slug: string | null
  condition: ListingCondition
  price_cents: number
  shipping_cents: number
  quantity: number
  allow_offers: boolean
  ships_from: string | null
  status: 'draft' | 'active'
}

export async function createListing(sellerId: string, draft: ListingDraft): Promise<Listing> {
  return unwrap(
    await supabase.from('listings').insert({ ...draft, seller_id: sellerId }).select().single(),
  ) as Listing
}

export async function updateListing(id: string, patch: Partial<ListingDraft>): Promise<Listing> {
  return unwrap(
    await supabase.from('listings').update(patch).eq('id', id).select().single(),
  ) as Listing
}

/**
 * Soft delete. A hard delete would break the FK from any order that
 * ever referenced this listing (orders.listing_id is ON DELETE
 * RESTRICT on purpose — a buyer's receipt should not evaporate because
 * the seller tidied up).
 */
export async function removeListing(id: string): Promise<void> {
  const { error } = await supabase.from('listings').update({ status: 'removed' }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function recordView(id: string): Promise<void> {
  await supabase.rpc('increment_listing_view', { p_listing_id: id })
}

// ── Photos ───────────────────────────────────────────────────────

/**
 * Upload to `{userId}/{listingId}/{uuid}.{ext}` — the storage policy in
 * migration 004 requires that first segment to be the caller's own id.
 */
export async function uploadPhoto(
  userId: string,
  listingId: string,
  file: File,
  position: number,
): Promise<void> {
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${userId}/${listingId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (uploadError) throw new Error(uploadError.message)

  const { data: { publicUrl } } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)

  const { error } = await supabase
    .from('listing_photos')
    .insert({ listing_id: listingId, storage_path: path, url: publicUrl, position })

  if (error) throw new Error(error.message)
}

export async function deletePhoto(photoId: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from('listing_photos').delete().eq('id', photoId)
  if (error) throw new Error(error.message)

  // Best effort: an orphaned object costs pennies, a failed delete that
  // blocks the UI costs a listing edit.
  await supabase.storage.from(PHOTO_BUCKET).remove([storagePath])
}

// ── Offers ───────────────────────────────────────────────────────

export async function makeOffer(
  listingId: string,
  buyerId: string,
  amountCents: number,
  message?: string,
): Promise<Offer> {
  return unwrap(
    await supabase
      .from('offers')
      .insert({
        listing_id: listingId,
        buyer_id: buyerId,
        amount_cents: amountCents,
        message: message || null,
      })
      .select()
      .single(),
  ) as Offer
}

export async function offersOnListing(listingId: string): Promise<Offer[]> {
  return unwrap(
    await supabase
      .from('offers')
      .select('*, buyer:profiles!offers_buyer_id_fkey(id, display_name, avatar_url)')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false }),
  ) as Offer[]
}

/** Every offer the current user has received as a seller, or sent as a buyer. */
export async function myOffers(): Promise<Offer[]> {
  return unwrap(
    await supabase
      .from('offers')
      .select(`
        *,
        buyer:profiles!offers_buyer_id_fkey(id, display_name, avatar_url),
        listing:listings!offers_listing_id_fkey(${LISTING_SELECT})
      `)
      .order('created_at', { ascending: false }),
  ) as Offer[]
}

export async function respondToOffer(offerId: string, accept: boolean): Promise<Offer> {
  return unwrap(
    await supabase.rpc('respond_to_offer', { p_offer_id: offerId, p_accept: accept }),
  ) as Offer
}

export async function withdrawOffer(offerId: string): Promise<Offer> {
  return unwrap(await supabase.rpc('withdraw_offer', { p_offer_id: offerId })) as Offer
}

// ── Orders ───────────────────────────────────────────────────────

const ORDER_SELECT = `
  *,
  listing:listings!orders_listing_id_fkey(${LISTING_SELECT}),
  buyer:profiles!orders_buyer_id_fkey(id, display_name),
  seller:profiles!orders_seller_id_fkey(id, display_name)
`

export async function myPurchases(userId: string): Promise<Order[]> {
  return unwrap(
    await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('buyer_id', userId)
      .neq('status', 'pending_payment')
      .order('created_at', { ascending: false }),
  ) as Order[]
}

export async function mySales(userId: string): Promise<Order[]> {
  return unwrap(
    await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('seller_id', userId)
      .neq('status', 'pending_payment')
      .order('created_at', { ascending: false }),
  ) as Order[]
}

export async function getOrderBySession(sessionId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as Order | null
}

export async function markShipped(
  orderId: string,
  carrier?: string,
  tracking?: string,
): Promise<Order> {
  return unwrap(
    await supabase.rpc('mark_shipped', {
      p_order_id: orderId,
      p_carrier: carrier ?? null,
      p_tracking: tracking ?? null,
    }),
  ) as Order
}

export async function confirmDelivery(orderId: string): Promise<Order> {
  return unwrap(await supabase.rpc('confirm_delivery', { p_order_id: orderId })) as Order
}

// ── Payments (Edge Functions) ────────────────────────────────────

/** Returns a Stripe Checkout URL for the browser to navigate to. */
export async function startCheckout(args: {
  listingId: string
  quantity?: number
  offerId?: string | null
}): Promise<string> {
  const { url } = await callFunction<{ url: string }>('create-checkout', {
    listing_id: args.listingId,
    quantity: args.quantity ?? 1,
    offer_id: args.offerId ?? null,
  })
  return url
}

/** Stripe-hosted onboarding, or the Express dashboard once set up. */
export async function payoutLink(action: 'onboard' | 'dashboard'): Promise<string> {
  const { url } = await callFunction<{ url: string }>('connect-onboarding', { action })
  return url
}
