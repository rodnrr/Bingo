import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Search, PlusCircle, Package, ShoppingBag, UserCircle, Menu, X, Mail, LogOut, ShieldCheck,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore, isMember } from '@/lib/store'
import { signOut } from '@/lib/auth'
import { Container } from '@/components/ui'
import ThemeToggle from './ThemeToggle'
import ToastContainer from './ToastContainer'

const NAV = [
  { to: '/browse',    label: 'Browse',    icon: Search },
  { to: '/sell',      label: 'Sell',      icon: PlusCircle },
  { to: '/listings',  label: 'Listings',  icon: Package },
  { to: '/purchases', label: 'Purchases', icon: ShoppingBag },
  { to: '/invites',   label: 'Invites',   icon: Mail },
]

/** BEEN in a lit block, -GO! outside it. */
function Wordmark() {
  return (
    <span className="flex items-center font-display text-lg font-bold tracking-tight">
      <span className="rounded-sm bg-primary px-1.5 py-0.5 text-primary-fg shadow-glow-sm">
        BEEN
      </span>
      <span className="pl-1 text-fg">-GO!</span>
    </span>
  )
}

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
      {/* The header floats over the grid: translucent, blurred, with a
          single hairline instead of a shadow. */}
      <header className="sticky top-0 z-40 hairline-b bg-canvas/80 backdrop-blur-xl">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link to={member ? '/browse' : '/'} aria-label="Been-go! home">
            <Wordmark />
          </Link>

          {member && (
            <nav className="hidden items-center gap-0.5 md:flex">
              {NAV.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    clsx('nav-link', isActive && 'nav-link-active')
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-1">
            <ThemeToggle />

            {userId ? (
              <>
                {profile?.is_admin && (
                  <Link to="/admin" className="nav-link hidden text-primary md:flex">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Admin
                  </Link>
                )}
                <Link to="/account" className="nav-link hidden md:flex">
                  <UserCircle className="h-3.5 w-3.5" />
                  {profile?.display_name ?? 'Account'}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="hidden rounded p-2 text-fg-subtle transition-colors hover:bg-panel2 hover:text-fg md:block"
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
              className="rounded p-2 text-fg-muted transition-colors hover:bg-panel2 hover:text-fg md:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </Container>

        {menuOpen && (
          <div className="hairline-t bg-panel md:hidden">
            <Container className="flex flex-col py-2">
              {member &&
                NAV.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className="nav-link !py-3"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              {userId && (
                <>
                  {profile?.is_admin && (
                    <NavLink to="/admin" onClick={() => setMenuOpen(false)}
                             className="nav-link !py-3 text-primary">
                      <ShieldCheck className="h-4 w-4" /> Admin
                    </NavLink>
                  )}
                  <NavLink to="/account" onClick={() => setMenuOpen(false)} className="nav-link !py-3">
                    <UserCircle className="h-4 w-4" /> Account
                  </NavLink>
                  <button onClick={handleSignOut} className="nav-link !py-3 text-left">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </>
              )}
            </Container>
          </div>
        )}
      </header>

      <main className="flex-1 py-10">
        <Outlet />
      </main>

      <footer className="hairline-t py-10">
        <Container className="text-center">
          <nav className="mb-4 flex flex-wrap justify-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-micro text-fg-subtle">
            <Link to="/legal/terms"   className="transition-colors hover:text-primary">Terms</Link>
            <Link to="/legal/rules"   className="transition-colors hover:text-primary">Rules</Link>
            <Link to="/legal/privacy" className="transition-colors hover:text-primary">Privacy</Link>
          </nav>
          <p className="text-sm text-fg-muted">
            Been-go! — invite only. Be good to each other.
          </p>
          <p className="mt-1.5 text-xs text-fg-subtle">
            A venue, not the seller. Payments handled by Stripe — we never see your card
            or bank details.
          </p>
        </Container>
      </footer>

      <ToastContainer />
    </div>
  )
}
