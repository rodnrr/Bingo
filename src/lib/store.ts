import { create } from 'zustand'
import type { Profile, ToastMessage } from '@/types'

// ── Auth / session state ─────────────────────────────────────────
// The profile is the source of truth for what the UI offers, but never
// for what the UI is *allowed* to do — that lives in RLS. Hiding the
// Sell button for a non-member is a courtesy; the policy is the fence.

interface AuthState {
  userId:    string | null
  email:     string | null
  profile:   Profile | null
  /** Version currently in force, from platform_settings. */
  termsVersion:  string | null
  /** Whether this user has accepted that exact version. */
  termsAccepted: boolean
  isLoading: boolean
  setSession: (session: {
    userId: string
    email: string | null
    profile: Profile | null
    termsVersion?: string | null
    termsAccepted?: boolean
  }) => void
  setProfile: (profile: Profile | null) => void
  setTerms:   (version: string | null, accepted: boolean) => void
  clear:      () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  userId:        null,
  email:         null,
  profile:       null,
  termsVersion:  null,
  termsAccepted: false,
  isLoading:     true,
  setSession: ({ userId, email, profile, termsVersion, termsAccepted }) =>
    set({
      userId,
      email,
      profile,
      termsVersion:  termsVersion ?? null,
      termsAccepted: termsAccepted ?? false,
      isLoading: false,
    }),
  setProfile: (profile) => set({ profile }),
  setTerms:   (termsVersion, termsAccepted) => set({ termsVersion, termsAccepted }),
  clear: () => set({
    userId: null, email: null, profile: null,
    termsVersion: null, termsAccepted: false, isLoading: false,
  }),
  setLoading: (isLoading) => set({ isLoading }),
}))

/** Signed in AND past the invite gate. */
export const isMember = (profile: Profile | null): boolean => profile?.status === 'active'

/**
 * Can actually receive money — the gate on listing something for sale.
 *
 * Note what this is not: it is not a permission check. RLS and the
 * Edge Functions decide what anyone may do. This only decides what the
 * interface bothers offering them.
 */
export const canSell = (profile: Profile | null): boolean =>
  profile?.status === 'active' && profile.stripe_charges_enabled === true

// ── Toasts ───────────────────────────────────────────────────────

interface ToastState {
  toasts: ToastMessage[]
  push:   (message: string, type?: ToastMessage['type']) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type = 'info') => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (m: string) => useToastStore.getState().push(m, 'success'),
  error:   (m: string) => useToastStore.getState().push(m, 'error'),
  info:    (m: string) => useToastStore.getState().push(m, 'info'),
}
