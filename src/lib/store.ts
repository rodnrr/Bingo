import { create } from 'zustand'
import type { Profile, ToastMessage } from '@/types'

// ── Auth / session state ─────────────────────────────────────────
// The profile is the source of truth for what the UI offers, but never
// for what the UI is *allowed* to do — that lives in RLS. Hiding the
// Sell button for a non-member is a courtesy; the policy is the fence.

interface AuthState {
  userId:    string | null
  email:     string | null
  // Phone sign-ins have no email at all, so the identity shown in the
  // header and on /account has to come from whichever one exists.
  phone:     string | null
  profile:   Profile | null
  isLoading: boolean
  setSession: (session: {
    userId: string
    email: string | null
    phone: string | null
    profile: Profile | null
  }) => void
  setProfile: (profile: Profile | null) => void
  clear:      () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  userId:    null,
  email:     null,
  phone:     null,
  profile:   null,
  isLoading: true,
  setSession: ({ userId, email, phone, profile }) =>
    set({ userId, email, phone, profile, isLoading: false }),
  setProfile: (profile) => set({ profile }),
  clear:      () =>
    set({ userId: null, email: null, phone: null, profile: null, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}))

/**
 * Signed in AND past the invite gate.
 *
 * A super admin is a member without ever redeeming a code — the same
 * hole is punched in `is_member()` in migration 005, and these two have
 * to agree or the UI offers pages the database then refuses.
 */
export const isMember = (profile: Profile | null): boolean =>
  profile?.status === 'active' || profile?.is_super_admin === true

/** Can open the admin area. Mirrors `is_admin()` in SQL. */
export const isAdmin = (profile: Profile | null): boolean =>
  profile?.is_super_admin === true || (profile?.is_admin === true && profile.status === 'active')

/** Can make other people admins. Mirrors `is_super_admin()` in SQL. */
export const isSuperAdmin = (profile: Profile | null): boolean =>
  profile?.is_super_admin === true

/** Can actually receive money — the gate on listing something for sale. */
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
