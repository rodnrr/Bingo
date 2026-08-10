import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Search, PlusCircle, Package, ShoppingBag, UserCircle, Menu, X, Mail, LogOut,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore, isMember } from '@/lib/store'
import { signOut } from '@/lib/auth'
import { Container } from '@/components/ui'
import ToastContainer from './ToastContainer'

const NAV = [
  { to: '/browse',    label: 'Browse',    icon: Search },
  { to: '/sell',      label: 'Sell',      icon: PlusCircle },
  { to: '/listings',  label: 'Listings',  icon: Package },
  { to: '/purchases', label: 'Purchases', icon: ShoppingBag },
  { to: '/invites',   label: 'Invites',   icon: Mail },
]

export default function RootLayout() {
  const { profile, userId } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const member = isMember(profile)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link to={member ? '/browse' : '/'} className="flex items-center gap-2 font-bold text-lg">
            <span className="rounded-lg bg-primary-600 px-2 py-1 text-white">Rise</span>
            <span>Bay</span>
          </Link>

          {member && (
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary-50 text-primary-700 dark:bg-slate-800 dark:text-primary-400'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-2">
            {userId ? (
              <>
                <Link
                  to="/account"
                  className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 md:flex dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <UserCircle className="h-4 w-4" />
                  {profile?.display_name ?? 'Account'}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:block dark:hover:bg-slate-800"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-primary btn-sm">Sign in</Link>
            )}

            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </Container>

        {menuOpen && (
          <div className="border-t border-gray-200 bg-white md:hidden dark:border-slate-700 dark:bg-slate-900">
            <Container className="flex flex-col py-2">
              {member &&
                NAV.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              {userId && (
                <>
                  <NavLink
                    to="/account"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <UserCircle className="h-4 w-4" /> Account
                  </NavLink>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </>
              )}
            </Container>
          </div>
        )}
      </header>

      <main className="flex-1 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500 dark:border-slate-700">
        <Container>
          <p>RiseBay — invite only. Be good to each other.</p>
          <p className="mt-1 text-xs">
            Payments handled by Stripe. RiseBay never sees your card or bank details.
          </p>
        </Container>
      </footer>

      <ToastContainer />
    </div>
  )
}
