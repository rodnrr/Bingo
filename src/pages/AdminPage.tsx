import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, PlusCircle, Package, ShoppingBag, Mail, UserCircle, Tag, Store,
  Receipt, ShieldCheck, ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import {
  adminListMembers, adminSetInvites, adminSetMemberStatus, adminSetRole, adminStats,
} from '@/lib/api'
import { refreshProfile } from '@/lib/auth'
import { money, timeAgo } from '@/lib/format'
import { useAuthStore, isSuperAdmin, toast } from '@/lib/store'
import {
  Button, Card, Container, EmptyState, ErrorNote, LoadingBlock, PageHeading,
} from '@/components/ui'
import { MEMBER_STATUS_LABELS, type AdminMember, type MemberStatus } from '@/types'

// ── The page directory ───────────────────────────────────────────
// Every route in the app, in one place. An admin's job starts with
// looking at what members see, and hunting for URLs is a bad way to
// begin — so the tour is a list, not a scavenger hunt.

const PAGES: { to: string; label: string; note: string; icon: typeof Search }[] = [
  { to: '/browse',    label: 'Browse',    icon: Search,      note: 'Every active listing, search and filters' },
  { to: '/sell',      label: 'Sell',      icon: PlusCircle,  note: 'The listing composer' },
  { to: '/listings',  label: 'Listings',  icon: Package,     note: 'Your own listings, drafts included' },
  { to: '/purchases', label: 'Purchases', icon: ShoppingBag, note: 'Orders you placed' },
  { to: '/sales',     label: 'Sales',     icon: Receipt,     note: 'Orders to fulfil, with tracking' },
  { to: '/offers',    label: 'Offers',    icon: Tag,         note: 'Offers made and received' },
  { to: '/invites',   label: 'Invites',   icon: Mail,        note: 'Mint and revoke invite codes' },
  { to: '/account',   label: 'Account',   icon: UserCircle,  note: 'Profile and Stripe payouts' },
  { to: '/',          label: 'Landing',   icon: Store,       note: 'What a signed-out visitor sees' },
]

// ── Small presentational bits ────────────────────────────────────

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-slate-700">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

const STATUS_BADGE: Record<MemberStatus, string> = {
  active:         'badge-success',
  pending_invite: 'badge-warning',
  suspended:      'badge-danger',
}

function roleOf(member: AdminMember): 'member' | 'admin' | 'super_admin' {
  if (member.is_super_admin) return 'super_admin'
  if (member.is_admin) return 'admin'
  return 'member'
}

const ROLE_LABEL = {
  member:      'Member',
  admin:       'Admin',
  super_admin: 'Super admin',
} as const

export default function AdminPage() {
  const { userId, profile } = useAuthStore()
  const queryClient = useQueryClient()
  const superAdmin = isSuperAdmin(profile)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<MemberStatus | ''>('')

  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminStats })

  const members = useQuery({
    queryKey: ['admin', 'members', search, statusFilter],
    queryFn: () => adminListMembers({ search, status: statusFilter || null }),
  })

  // Every mutation ends the same way: re-read the list and the counters,
  // and re-read your own profile too, because changing your own row is
  // exactly how an admin would otherwise leave the UI stale about their
  // own powers.
  const afterChange = async (message: string) => {
    await refreshProfile()
    queryClient.invalidateQueries({ queryKey: ['admin'] })
    toast.success(message)
  }

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MemberStatus }) =>
      adminSetMemberStatus(id, status),
    onSuccess: (_d, v) => afterChange(`Member set to ${MEMBER_STATUS_LABELS[v.status]}`),
    onError: (err: Error) => toast.error(err.message),
  })

  const setInvites = useMutation({
    mutationFn: ({ id, invites }: { id: string; invites: number }) =>
      adminSetInvites(id, invites),
    onSuccess: () => afterChange('Invite allowance updated'),
    onError: (err: Error) => toast.error(err.message),
  })

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'member' | 'admin' | 'super_admin' }) =>
      adminSetRole(id, role),
    onSuccess: (_d, v) => afterChange(`Role set to ${ROLE_LABEL[v.role]}`),
    onError: (err: Error) => toast.error(err.message),
  })

  const s = stats.data

  return (
    <Container>
      <PageHeading
        title="Admin"
        subtitle={
          superAdmin
            ? 'Super admin — every page, every member, and who gets to be an admin.'
            : 'Admin — every page and every member.'
        }
        action={
          <span className={clsx('badge', superAdmin ? 'badge-primary' : 'badge-neutral')}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            {superAdmin ? 'Super admin' : 'Admin'}
          </span>
        }
      />

      {/* ── Counters ── */}
      <Card className="mb-6">
        <h2 className="font-semibold">At a glance</h2>
        {stats.isLoading && <LoadingBlock />}
        {stats.error && <ErrorNote error={stats.error} />}
        {s && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat
              label="Members"
              value={String(s.members_total)}
              hint={`${s.members_active} active · ${s.members_pending} pending`}
            />
            <Stat label="Suspended" value={String(s.members_suspended)} />
            <Stat label="Admins" value={String(s.admins)} />
            <Stat label="Open invites" value={String(s.invites_open)} />
            <Stat
              label="Listings"
              value={String(s.listings_total)}
              hint={`${s.listings_active} live · ${s.listings_sold} sold`}
            />
            <Stat label="Offers pending" value={String(s.offers_pending)} />
            <Stat
              label="Orders"
              value={String(s.orders_total)}
              hint={`${s.orders_paid} paid`}
            />
            <Stat
              label="Gross sales"
              value={money(s.gmv_cents)}
              hint={`${money(s.fees_cents)} in fees`}
            />
          </div>
        )}
      </Card>

      {/* ── The tour ── */}
      <Card className="mb-6">
        <h2 className="font-semibold">Every page</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          You are inside the invite gate whether or not you ever redeemed a code, so
          all of these open. Member-scoped pages show <em>your</em> rows — an admin
          sees other people&rsquo;s listings and orders through the member table below.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PAGES.map(({ to, label, note, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
              <span>
                <span className="flex items-center gap-1 text-sm font-medium">
                  {label}
                  <ExternalLink className="h-3 w-3 text-gray-400" />
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">{note}</span>
              </span>
            </Link>
          ))}
        </div>
      </Card>

      {/* ── Members ── */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Members</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="input max-w-xs"
              placeholder="Name, handle, email or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search members"
            />
            <select
              className="input max-w-[12rem]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MemberStatus | '')}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {(Object.keys(MEMBER_STATUS_LABELS) as MemberStatus[]).map((key) => (
                <option key={key} value={key}>{MEMBER_STATUS_LABELS[key]}</option>
              ))}
            </select>
          </div>
        </div>

        {members.isLoading && <LoadingBlock />}
        {members.error && <div className="mt-4"><ErrorNote error={members.error} /></div>}

        {members.data?.length === 0 && (
          <div className="mt-4">
            <EmptyState title="Nobody matches that" body="Try a different search or clear the filter." />
          </div>
        )}

        {members.data && members.data.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Signs in with</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Invites</th>
                  <th className="py-2 pr-3 font-medium">Activity</th>
                  <th className="py-2 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {members.data.map((m) => {
                  const self = m.id === userId
                  const busy =
                    setStatus.isPending || setInvites.isPending || setRole.isPending

                  return (
                    <tr key={m.id} className="border-b border-gray-100 align-top dark:border-slate-800">
                      <td className="py-3 pr-3">
                        <p className="font-medium">
                          {m.display_name ?? 'No name'}
                          {self && <span className="ml-2 badge badge-neutral">you</span>}
                        </p>
                        <p className="text-xs text-gray-500">{m.email ?? m.phone ?? '—'}</p>
                        <p className="text-xs text-gray-400">joined {timeAgo(m.created_at)}</p>
                      </td>

                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {m.providers.length === 0 && <span className="text-xs text-gray-400">—</span>}
                          {m.providers.map((p) => (
                            <span key={p} className="badge badge-neutral capitalize">{p}</span>
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          {m.last_sign_in_at ? `seen ${timeAgo(m.last_sign_in_at)}` : 'never signed in'}
                        </p>
                      </td>

                      <td className="py-3 pr-3">
                        <span className={STATUS_BADGE[m.status]}>
                          {MEMBER_STATUS_LABELS[m.status]}
                        </span>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {m.status !== 'active' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => setStatus.mutate({ id: m.id, status: 'active' })}
                            >
                              Activate
                            </Button>
                          )}
                          {m.status !== 'suspended' && (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busy}
                              onClick={() => setStatus.mutate({ id: m.id, status: 'suspended' })}
                            >
                              Suspend
                            </Button>
                          )}
                        </div>
                      </td>

                      <td className="py-3 pr-3">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={m.invites_remaining}
                          disabled={busy}
                          aria-label={`Invite allowance for ${m.display_name ?? 'member'}`}
                          className="input w-20 py-1 text-sm"
                          onBlur={(e) => {
                            const value = Number(e.target.value)
                            if (Number.isNaN(value) || value === m.invites_remaining) return
                            setInvites.mutate({ id: m.id, invites: value })
                          }}
                        />
                      </td>

                      <td className="py-3 pr-3 text-xs text-gray-500">
                        <p>{m.listing_count} listings</p>
                        <p>{m.order_count} orders</p>
                      </td>

                      <td className="py-3">
                        {superAdmin ? (
                          <select
                            className="input w-36 py-1 text-sm"
                            value={roleOf(m)}
                            disabled={busy}
                            aria-label={`Role for ${m.display_name ?? 'member'}`}
                            onChange={(e) =>
                              setRole.mutate({
                                id: m.id,
                                role: e.target.value as 'member' | 'admin' | 'super_admin',
                              })
                            }
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super admin</option>
                          </select>
                        ) : (
                          <span className="badge badge-neutral">{ROLE_LABEL[roleOf(m)]}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!superAdmin && (
          <p className="mt-4 text-xs text-gray-500">
            Only a super admin can change roles or administer another admin.
          </p>
        )}
      </Card>
    </Container>
  )
}
