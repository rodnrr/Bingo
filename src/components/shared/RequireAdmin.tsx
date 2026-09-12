import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuthStore, isAdmin } from '@/lib/store'
import { Card, Container, LoadingBlock } from '@/components/ui'

/**
 * The admin half of RequireMember, with the same caveat: this is UX.
 * Every admin RPC re-checks is_admin() server-side, and the admin RLS
 * policies do the same, so someone who types /admin gets this screen —
 * and someone who bypasses this screen gets 'Admins only' from the
 * database instead.
 *
 * A signed-out visitor is bounced to /login rather than told the page
 * exists; a signed-in non-admin is told, because pretending /admin is a
 * 404 to someone who can already see the app just wastes their time.
 */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { userId, profile, isLoading } = useAuthStore()
  const location = useLocation()

  if (isLoading) return <LoadingBlock />

  if (!userId) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (!isAdmin(profile)) {
    return (
      <Container className="max-w-md">
        <Card>
          <h1 className="text-2xl font-bold">Admins only</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            This area is for Been-go staff. If you think you should have access, ask a
            super admin to grant it.
          </p>
        </Card>
      </Container>
    )
  }

  return <>{children}</>
}
