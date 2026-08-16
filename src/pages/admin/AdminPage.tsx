import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { adminStats } from '@/lib/api'
import { money } from '@/lib/format'
import { useAuthStore } from '@/lib/store'
import { Card, Container, ErrorNote, LoadingBlock, PageHeading } from '@/components/ui'
import AdminMembers from './AdminMembers'
import AdminReports from './AdminReports'
import AdminSettings from './AdminSettings'

const TABS = ['Overview', 'Members', 'Reports', 'Settings'] as const
type Tab = typeof TABS[number]

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={clsx('num mt-1 text-2xl font-medium', tone)}>{value}</p>
    </Card>
  )
}

function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminStats,
    refetchInterval: 60_000,
  })

  if (isLoading) return <LoadingBlock />
  if (error) return <ErrorNote error={error} />
  if (!data) return null

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Active members"  value={String(data.members_active)} />
      <Stat label="Awaiting invite" value={String(data.members_pending)} />
      <Stat
        label="Suspended"
        value={String(data.members_suspended)}
        tone={data.members_suspended > 0 ? 'text-danger' : undefined}
      />
      <Stat
        label="Open reports"
        value={String(data.reports_open)}
        tone={data.reports_open > 0 ? 'text-warning' : undefined}
      />
      <Stat label="Live listings"   value={String(data.listings_active)} />
      <Stat label="Paid orders"     value={String(data.orders_paid)} />
      <Stat label="Total sold"      value={money(data.gmv_cents)} />
      <Stat label="Your fees"       value={money(data.fees_cents)} tone="text-success" />
    </div>
  )
}

/**
 * The admin console. Access is a courtesy check here and a hard check
 * in the database: every admin operation goes through a SECURITY
 * DEFINER function that calls is_admin() itself, so a non-admin who
 * reaches this page can look at an empty shell and change nothing.
 */
export default function AdminPage() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState<Tab>('Overview')

  if (!profile?.is_admin) return <Navigate to="/browse" replace />

  return (
    <Container>
      <PageHeading title="Admin" subtitle="Members, reports, and platform settings." />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'rounded px-4 py-2 text-xs font-medium uppercase tracking-wide transition-colors',
              t === tab
                ? 'bg-primary text-primary-fg'
                : 'bg-panel2 text-fg-muted hairline hover:text-fg',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <Overview />}
      {tab === 'Members'  && <AdminMembers />}
      {tab === 'Reports'  && <AdminReports />}
      {tab === 'Settings' && <AdminSettings />}
    </Container>
  )
}
