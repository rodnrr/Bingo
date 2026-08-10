import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example → .env.local and fill in your project values.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const PHOTO_BUCKET = 'listing-photos'

/**
 * Call a Supabase Edge Function with the caller's session attached.
 *
 * supabase.functions.invoke() would do this too, but it swallows the
 * response body on non-2xx — and every useful error these functions
 * raise ("this seller has not finished setting up payouts") lives in
 * that body. So: plain fetch, and read the message back out.
 */
export async function callFunction<T>(name: string, body: unknown = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const payload = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(payload?.error ?? `${name} failed (${res.status})`)
  }

  return payload as T
}
