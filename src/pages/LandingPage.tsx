import { Navigate } from 'react-router-dom'
import { ShieldCheck, Ticket, Banknote, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { Button, Container, LoadingBlock } from '@/components/ui'

const POINTS = [
  {
    icon: Ticket,
    index: '01',
    title: 'Invite only',
    body: 'Every member was vouched for by someone already here. No drive-by scammers, no bot listings.',
  },
  {
    icon: Banknote,
    index: '02',
    title: 'Paid out properly',
    body: 'Sellers connect a bank account through Stripe. Money lands in your account, not in a balance you have to beg for.',
  },
  {
    icon: ShieldCheck,
    index: '03',
    title: 'Card details never touch us',
    body: 'Checkout is hosted by Stripe. Been-go! stores your orders — never your card or bank numbers.',
  },
]

export default function LandingPage() {
  const { userId, profile, isLoading } = useAuthStore()

  if (isLoading) return <LoadingBlock />
  if (userId && profile?.status === 'active') return <Navigate to="/browse" replace />
  if (userId) return <Navigate to="/welcome" replace />

  return (
    <Container>
      <section className="relative py-16 sm:py-24">
        {/* Reads --glow-alpha, which the original palette sets to 0. The
            element stays so a future theme can switch the bloom back on
            from tokens rather than from a hardcoded number in here. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-[820px] max-w-[140vw] -translate-x-1/2"
          style={{
            background:
              'radial-gradient(ellipse at center, rgb(var(--primary) / var(--glow-alpha)), transparent 68%)',
          }}
        />

        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-micro text-primary hairline">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
            Invite only
          </p>

          <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
            List it.
            <br />
            <span className="text-primary">It&rsquo;s been gone.</span>
          </h1>

          <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
            A buy-and-sell marketplace you can only join with an invite from a member.
            Put it up, sell it to people who were vouched for, get paid to your bank.
          </p>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button to="/signup" size="lg">
              I have an invite code <ArrowRight className="h-4 w-4" />
            </Button>
            <Button to="/login" variant="secondary" size="lg">Sign in</Button>
          </div>
        </div>
      </section>

      <section className="pb-20">
        <p className="eyebrow mb-5">How it works</p>

        <div className="grid gap-px overflow-hidden rounded-lg hairline sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, index, title, body }) => (
            <div
              key={title}
              className="group relative bg-panel p-6 transition-colors duration-200 hover:bg-panel2"
            >
              <div className="mb-4 flex items-center justify-between">
                <Icon className="h-5 w-5 text-primary" />
                <span className="num text-[10px] text-fg-subtle">{index}</span>
              </div>
              <h2 className="font-display text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
              {/* Lit edge on hover — the panel acknowledges the pointer. */}
              <span className="absolute inset-x-0 bottom-0 h-px scale-x-0 bg-primary opacity-0 transition-all duration-300 group-hover:scale-x-100 group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </section>
    </Container>
  )
}
