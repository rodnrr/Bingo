import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RootLayout from '@/components/shared/RootLayout'
import RequireMember from '@/components/shared/RequireMember'
import RequireAdmin from '@/components/shared/RequireAdmin'
import { LoadingBlock } from '@/components/ui'
import { initAuth } from '@/lib/auth'

// Public / gate pages — small, and needed on first paint for signed-out
// visitors, so they load eagerly.
import LandingPage from '@/pages/LandingPage'
import LoginPage   from '@/pages/LoginPage'
import SignupPage  from '@/pages/SignupPage'
import WelcomePage from '@/pages/WelcomePage'

// Everything behind the invite gate is split per route.
const BrowsePage        = lazy(() => import('@/pages/BrowsePage'))
const ListingDetailPage = lazy(() => import('@/pages/ListingDetailPage'))
const SellPage          = lazy(() => import('@/pages/SellPage'))
const MyListingsPage    = lazy(() => import('@/pages/MyListingsPage'))
const PurchasesPage     = lazy(() => import('@/pages/PurchasesPage'))
const SalesPage         = lazy(() => import('@/pages/SalesPage'))
const OffersPage        = lazy(() => import('@/pages/OffersPage'))
const InvitesPage       = lazy(() => import('@/pages/InvitesPage'))
const AccountPage       = lazy(() => import('@/pages/AccountPage'))
const CheckoutReturnPage = lazy(() => import('@/pages/CheckoutReturnPage'))
const AuthCallbackPage  = lazy(() => import('@/pages/AuthCallbackPage'))
const AdminPage         = lazy(() => import('@/pages/AdminPage'))
const NotFoundPage      = lazy(() => import('@/pages/NotFoundPage'))

const gated = (element: React.ReactNode) => <RequireMember>{element}</RequireMember>
const admin = (element: React.ReactNode) => <RequireAdmin>{element}</RequireAdmin>

export default function App() {
  useEffect(() => initAuth(), [])

  return (
    <Suspense fallback={<LoadingBlock />}>
      <Routes>
        <Route element={<RootLayout />}>
          {/* Open */}
          <Route path="/"              element={<LandingPage />} />
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/signup"        element={<SignupPage />} />
          <Route path="/welcome"       element={<WelcomePage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Members only */}
          <Route path="/browse"          element={gated(<BrowsePage />)} />
          <Route path="/listing/:id"     element={gated(<ListingDetailPage />)} />
          <Route path="/sell"            element={gated(<SellPage />)} />
          <Route path="/sell/:id"        element={gated(<SellPage />)} />
          <Route path="/listings"        element={gated(<MyListingsPage />)} />
          <Route path="/purchases"       element={gated(<PurchasesPage />)} />
          <Route path="/sales"           element={gated(<SalesPage />)} />
          <Route path="/offers"          element={gated(<OffersPage />)} />
          <Route path="/invites"         element={gated(<InvitesPage />)} />
          <Route path="/account"         element={gated(<AccountPage />)} />
          <Route path="/orders/return"   element={gated(<CheckoutReturnPage />)} />

          {/* Staff */}
          <Route path="/admin" element={admin(<AdminPage />)} />

          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*"    element={<Navigate to="/404" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
