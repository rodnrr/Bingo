import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuthStore } from '@/lib/store'
import { LoadingBlock } from '@/components/ui'

/**
 * The route-level half of the invite gate.
 *
 * There are three states, and conflating any two of them is the classic
 * bug in this pattern:
 *
 *   loading          → show nothing yet (redirecting here logs people out
 *                      on every refresh)
 *   no session       → /login
 *   pending_invite   → /welcome, to redeem a code
 *
 * This is UX, not security. The database enforces the same gate in RLS,
 * so a user who edits their way past this screen still cannot read a
 * single listing.
 */
export default function RequireMember({ children }: { children: ReactNode }) {
  const { userId, profile, isLoading } = useAuthStore()
  const location = useLocation()

  if (isLoading) return <LoadingBlock />

  if (!userId) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (profile?.status !== 'active') {
    return <Navigate to="/welcome" replace />
  }

  return <>{children}</>
}
