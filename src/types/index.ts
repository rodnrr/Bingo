// ================================================================
// Been-go — shared types
//
// Hand-written rather than generated. The schema is small enough that
// `supabase gen types` would be more ceremony than it is worth; if the
// schema grows past a couple of dozen tables, generate then and delete
// this file rather than keeping both.
// ================================================================

export type MemberStatus = 'pending_invite' | 'active' | 'suspended'

export type ListingStatus = 'draft' | 'active' | 'sold' | 'removed'

export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair' | 'for_parts'

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export interface Profile {
  id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  status: MemberStatus
  is_admin: boolean
  invited_by: string | null
  invites_remaining: number
  stripe_account_id: string | null
  stripe_charges_enabled: boolean
  stripe_payouts_enabled: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  slug: string
  name: string
  parent_slug: string | null
  icon: string | null
  sort_order: number
}

export interface ListingPhoto {
  id: string
  listing_id: string
  storage_path: string
  url: string
  position: number
  created_at: string
}

export interface Listing {
  id: string
  seller_id: string
  title: string
  description: string
  category_slug: string | null
  condition: ListingCondition
  price_cents: number
  shipping_cents: number
  currency: string
  quantity: number
  allow_offers: boolean
  ships_from: string | null
  status: ListingStatus
  view_count: number
  created_at: string
  updated_at: string
  sold_at: string | null

  // Joined in some queries
  photos?: ListingPhoto[]
  seller?: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'handle'>
}

export interface Offer {
  id: string
  listing_id: string
  buyer_id: string
  amount_cents: number
  message: string | null
  status: OfferStatus
  created_at: string
  responded_at: string | null

  listing?: Listing
  buyer?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
}

export interface Order {
  id: string
  listing_id: string
  buyer_id: string
  seller_id: string
  quantity: number
  item_cents: number
  shipping_cents: number
  fee_cents: number
  total_cents: number
  currency: string
  status: OrderStatus
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  ship_to: ShipTo | null
  tracking_carrier: string | null
  tracking_number: string | null
  created_at: string
  paid_at: string | null
  shipped_at: string | null
  delivered_at: string | null

  listing?: Listing
  buyer?: Pick<Profile, 'id' | 'display_name'>
  seller?: Pick<Profile, 'id' | 'display_name'>
}

/** Shape Stripe hands back in `shipping_details` / `customer_details`. */
export interface ShipTo {
  name?: string | null
  email?: string | null
  address?: {
    line1?: string | null
    line2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
    country?: string | null
  } | null
}

export interface Invite {
  id: string
  code: string
  created_by: string
  email: string | null
  note: string | null
  max_uses: number
  used_count: number
  expires_at: string
  revoked_at: string | null
  created_at: string
}

export interface ToastMessage {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export interface BrowseFilters {
  q?: string
  category?: string
  minPrice?: number
  maxPrice?: number
}

export const CONDITION_LABELS: Record<ListingCondition, string> = {
  new:       'New',
  like_new:  'Like new',
  good:      'Good',
  fair:      'Fair',
  for_parts: 'For parts',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid:            'Paid — awaiting shipment',
  shipped:         'Shipped',
  delivered:       'Delivered',
  cancelled:       'Cancelled',
  refunded:        'Refunded',
}
