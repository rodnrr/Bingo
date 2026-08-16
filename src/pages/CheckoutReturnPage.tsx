import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock } from 'lucide-react'
import { getOrderBySession } from '@/lib/api'
import { money } from '@/lib/format'
import { Button, Card, Container, LoadingBlock } from '@/components/ui'

/**
 * Where Stripe sends the buyer after a successful payment.
 *
 * The subtlety: this page can easily load *before* the webhook has
 * marked the order paid. So it polls for a few seconds and, if the row
 * is still pending, says "payment received, still confirming" rather
 * than "failed" — because the money has, in fact, left their card.
 */
export default function CheckoutReturnPage() {
  const [params] = useSearchParams()
  const sessionId = params.get('session_id') ?? ''
  const [attempts, setAttempts] = useState(0)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order-by-session', sessionId, attempts],
    queryFn: () => getOrderBySession(sessionId),
    enabled: Boolean(sessionId),
  })

  const settled = order && order.status !== 'pending_payment'

  useEffect(() => {
    if (settled || attempts >= 5) return
    const timer = setTimeout(() => setAttempts((n) => n + 1), 2000)
    return () => clearTimeout(timer)
  }, [settled, attempts])

  if (!sessionId) {
    return (
      <Container className="max-w-md">
        <Card>
          <h1 className="text-xl font-bold">No order to show</h1>
          <Button to="/purchases" className="mt-4">Go to purchases</Button>
        </Card>
      </Container>
    )
  }

  if (isLoading && attempts === 0) return <LoadingBlock label="Confirming your order…" />

  return (
    <Container className="max-w-md">
      <Card className="text-center">
        {settled ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="mt-3 text-2xl font-bold">Order confirmed</h1>
            <p className="mt-1 text-sm text-fg-muted">
              You paid {money(order.total_cents, order.currency)}. The seller has your shipping
              address and will send it out.
            </p>
          </>
        ) : (
          <>
            <Clock className="mx-auto h-12 w-12 text-warning" />
            <h1 className="mt-3 text-2xl font-bold">Payment received</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Stripe has your payment and we are finishing the order. This usually takes a few
              seconds — it will appear under Purchases either way. Nothing else is needed from you.
            </p>
          </>
        )}

        <div className="mt-5 flex justify-center gap-2">
          <Button to="/purchases">View purchases</Button>
          <Button to="/browse" variant="secondary">Keep browsing</Button>
        </div>
      </Card>
    </Container>
  )
}
