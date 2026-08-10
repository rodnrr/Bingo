// ================================================================
// Been-go — auth wiring
//
// Supabase owns sessions; this module owns the app's reaction to them.
// The one rule worth stating: a session alone means nothing here. Every
// signed-in user starts as 'pending_invite', so the profile is always
// loaded alongside the session and the app routes on the profile.
// ================================================================

import { supabase } from './supabase'
import { getProfile } from './api'
import { useAuthStore } from './store'

/**
 * Wire the store to Supabase auth. Call once at app start; returns an
 * unsubscribe for StrictMode's double-mount.
 */
export function initAuth(): () => void {
  const { setSession, clear, setLoading } = useAuthStore.getState()

  const load = async (userId: string, email: string | null) => {
    try {
      const profile = await getProfile(userId)
      setSession({ userId, email, profile })
    } catch {
      // A profile read that fails should not strand the user on a
      // spinner — let them through to a page that can say so.
      setSession({ userId, email, profile: null })
    }
  }

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) load(session.user.id, session.user.email ?? null)
    else setLoading(false)
  })

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      clear()
      return
    }
    // TOKEN_REFRESHED fires often and carries no new profile information.
    if (event === 'TOKEN_REFRESHED' && useAuthStore.getState().profile) return

    load(session.user.id, session.user.email ?? null)
  })

  return () => subscription.unsubscribe()
}

/** Re-read the profile — after redeeming an invite, or finishing Stripe onboarding. */
export async function refreshProfile(): Promise<void> {
  const { userId, setProfile } = useAuthStore.getState()
  if (!userId) return
  setProfile(await getProfile(userId))
}

export async function signUp(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
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

export async function signOut() {
  await supabase.auth.signOut()
  useAuthStore.getState().clear()
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback?mode=reset`,
  })
  if (error) throw new Error(error.message)
}
