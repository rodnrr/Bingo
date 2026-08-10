import { Navigate } from 'react-router-dom'
import { ShieldCheck, Ticket, Banknote } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { Button, Container, LoadingBlock } from '@/components/ui'

const POINTS = [
  {
    icon: Ticket,
    title: 'Invite only',
    body: 'Every member was vouched for by someone already here. No drive-by scammers, no bot listings.',
  },
  {
    icon: Banknote,
    title: 'Paid out properly',
    body: 'Sellers connect a bank account through Stripe. Money lands in your account, not in a balance you have to beg for.',
  },
  {
    icon: ShieldCheck,
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
      <section className="py-12 text-center sm:py-20">
        <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          List it.{' '}
          <span className="text-primary-600">It&rsquo;s been gone.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600 dark:text-slate-400">
          Been-go! is a buy-and-sell marketplace you can only join with an invite from a
          member. Put it up, sell it to people who were vouched for, get paid to your bank.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button to="/signup" size="lg">I have an invite code</Button>
          <Button to="/login" variant="secondary" size="lg">Sign in</Button>
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card">
            <Icon className="mb-3 h-6 w-6 text-primary-600" />
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{body}</p>
          </div>
        ))}
      </section>
    </Container>
  )
}
