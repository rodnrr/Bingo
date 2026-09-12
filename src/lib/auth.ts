// ================================================================
// Been-go — auth wiring
//
// Supabase owns sessions; this module owns the app's reaction to them.
// The one rule worth stating: a session alone means nothing here. Every
// signed-in user starts as 'pending_invite', so the profile is always
// loaded alongside the session and the app routes on the profile.
// ================================================================

import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getProfile } from './api'
import { useAuthStore } from './store'

/** Where every provider redirect comes back to. */
const callbackUrl = () => `${window.location.origin}/auth/callback`

/**
 * Wire the store to Supabase auth. Call once at app start; returns an
 * unsubscribe for StrictMode's double-mount.
 */
export function initAuth(): () => void {
  const { setSession, clear, setLoading } = useAuthStore.getState()

  const load = async (user: User) => {
    const identity = {
      userId: user.id,
      email:  user.email ?? null,
      phone:  user.phone ?? null,
    }
    try {
      setSession({ ...identity, profile: await getProfile(user.id) })
    } catch {
      // A profile read that fails should not strand the user on a
      // spinner — let them through to a page that can say so.
      setSession({ ...identity, profile: null })
    }
  }

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) load(session.user)
    else setLoading(false)
  })

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      clear()
      return
    }
    // TOKEN_REFRESHED fires often and carries no new profile information.
    if (event === 'TOKEN_REFRESHED' && useAuthStore.getState().profile) return

    load(session.user)
  })

  return () => subscription.unsubscribe()
}

/** Re-read the profile — after redeeming an invite, or finishing Stripe onboarding. */
export async function refreshProfile(): Promise<void> {
  const { userId, setProfile } = useAuthStore.getState()
  if (!userId) return
  setProfile(await getProfile(userId))
}

// ── Email + password ─────────────────────────────────────────────

export async function signUp(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: callbackUrl(),
    },
  })
  if (error) throw new Error(error.message)
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data
}

// ── Google ───────────────────────────────────────────────────────

/**
 * Hands the browser to Google and does not return: the session arrives
 * back at /auth/callback in the URL fragment, where detectSessionInUrl
 * picks it up. Nothing after this call runs on success.
 *
 * A brand-new Google account lands at 'pending_invite' like any other,
 * so the invite code stashed at signup is still what admits them.
 */
export async function signInWithGoogle(next?: string) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: next ? `${callbackUrl()}?next=${encodeURIComponent(next)}` : callbackUrl(),
      // Without this, a second sign-in silently reuses whichever Google
      // account the browser used first — confusing on a shared machine.
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw new Error(error.message)
}

// ── Phone (SMS one-time code) ────────────────────────────────────

/**
 * Supabase wants E.164 (+15551234567). People type (555) 123-4567.
 * Strip everything that is not a digit or a leading plus, and assume
 * a bare 10-digit number is North American — the common case for a
 * default, not a rule anyone is stuck with, since typing the + wins.
 */
export function toE164(input: string): string {
  const trimmed = input.trim()
  const digits = trimmed.replace(/[^\d]/g, '')

  if (trimmed.startsWith('+')) return `+${digits}`
  if (digits.length === 10)    return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

/** Text a 6-digit code. Creates the account if the number is new. */
export async function sendPhoneCode(phone: string) {
  const { error } = await supabase.auth.signInWithOtp({
    phone: toE164(phone),
    options: { shouldCreateUser: true },
  })
  if (error) throw new Error(error.message)
}

/** Exchange the texted code for a session. */
export async function verifyPhoneCode(phone: string, code: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone: toE164(phone),
    token: code.trim(),
    type:  'sms',
  })
  if (error) throw new Error(error.message)
  return data
}

// ── Session ──────────────────────────────────────────────────────

export async function signOut() {
  await supabase.auth.signOut()
  useAuthStore.getState().clear()
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${callbackUrl()}?mode=reset`,
  })
  if (error) throw new Error(error.message)
}
