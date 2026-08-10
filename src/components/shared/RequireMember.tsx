import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuthStore } from '@/lib/store'
import { LoadingBlock } from '@/components/ui'

/**
 * The route-level half of the invite and agreement gates.
 *
 * There are four states, and conflating any two of them is the classic
 * bug in this pattern:
 *
 *   loading          → show nothing yet (redirecting here logs people out
 *                      on every refresh)
 *   no session       → /login
 *   pending_invite   → /welcome, to redeem a code
 *   terms not agreed → /agreement
 *
 * This is UX, not security. The database enforces the same two gates in
 * RLS — is_member() and has_accepted_terms() — so a user who edits
 * their way past this screen still cannot read a listing or create one.
 *
 * `allowWithoutTerms` exists for the pages someone must be able to
 * reach *while* deciding whether to agree: their own account, and the
 * agreement screen itself.
 */
export default function RequireMember({
  children,
  allowWithoutTerms = false,
}: {
  children: ReactNode
  allowWithoutTerms?: boolean
}) {
  const { userId, profile, termsAccepted, isLoading } = useAuthStore()
  const location = useLocation()

  if (isLoading) return <LoadingBlock />

  if (!userId) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (profile?.status !== 'active') {
    return <Navigate to="/welcome" replace />
  }

  if (!termsAccepted && !allowWithoutTerms) {
    return <Navigate to="/agreement" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
