// ================================================================
// Been-go — shared Edge Function helpers
//
// Every function in this folder runs on the server with the
// service-role key, which bypasses RLS entirely. That makes this file
// the place where "who is calling" gets established, once, correctly:
// requireUser() re-reads the caller from their JWT rather than
// believing any id the request body claims.
// ================================================================

import Stripe from 'npm:stripe@17.7.0'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

// The platform fee is deliberately NOT an env var. It lives in the
// platform_settings row, so the percentage a seller is shown before
// listing and the percentage create-checkout charges are the same
// number read from the same place. Read it with the current_fee_bps()
// RPC.

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2025-01-27.acacia',
  // The Deno runtime has no Node http stack; Stripe needs its fetch client.
  httpClient: Stripe.createFetchHttpClient(),
})

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Service-role client: bypasses RLS. Only ever used server-side. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/**
 * Resolve the calling user from the Authorization header, and confirm
 * they are an active member. Throws HttpError, which the handlers
 * translate into a response.
 *
 * `requireTerms` adds the agreement check for the operations that
 * create an obligation. It is checked here as well as in RLS because
 * these functions run with the service-role key, which bypasses RLS —
 * the policy would not fire on this path.
 */
export async function requireUser(
  req: Request,
  db: SupabaseClient,
  opts: { requireTerms?: boolean } = {},
) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Sign in first')

  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Sign in first')

  const { data: profile } = await db
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single()

  if (!profile) throw new HttpError(403, 'No profile for this account')
  if (profile.status === 'suspended') {
    throw new HttpError(403, 'This account is suspended')
  }
  if (profile.status !== 'active') {
    throw new HttpError(403, 'Redeem an invite code before using Been-go!')
  }

  if (opts.requireTerms) {
    const { data: version } = await db.rpc('current_terms_version')
    const { data: accepted } = await db
      .from('terms_acceptances')
      .select('version')
      .eq('user_id', profile.id)
      .eq('version', version)
      .maybeSingle()

    if (!accepted) {
      throw new HttpError(403, 'Accept the current terms before buying or selling')
    }
  }

  return { user: data.user, profile }
}

/** Wrap a handler so thrown HttpErrors become clean JSON responses. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    try {
      return await fn(req)
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      console.error(err)
      return json({ error: 'Something went wrong on our end' }, 500)
    }
  }
}
