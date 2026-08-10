import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import clsx from 'clsx'
import { adminGrantInvites, adminListMembers, adminSetMemberStatus } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { useAuthStore, toast } from '@/lib/store'
import { Button, Card, EmptyState, ErrorNote, LoadingBlock } from '@/components/ui'
import type { MemberStatus } from '@/types'

const STATUS_CLASS: Record<MemberStatus, string> = {
  active:         'badge-success',
  pending_invite: 'badge-warning',
  suspended:      'badge-danger',
}

export default function AdminMembers() {
  const { userId } = useAuthStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-members', search],
    queryFn: () => adminListMembers(search),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-members'] })
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
  }

  const setStatus = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: MemberStatus; reason?: string }) =>
      adminSetMemberStatus(id, status, reason),
    onSuccess: () => { toast.success('Member updated'); invalidate() },
    onError: (err: Error) => toast.error(err.message),
  })

  const grant = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => adminGrantInvites(id, count),
    onSuccess: () => { toast.success('Invites updated'); invalidate() },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); setSearch(draft) }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by display name…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Search members"
          />
        </div>
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      {error && <ErrorNote error={error} />}

      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState title="No members matched" />
      ) : (
        <div className="space-y-2">
          {data.map((member) => {
            const isSelf = member.id === userId
            return (
              <Card key={member.id} className="flex flex-wrap items-center gap-3 !p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {member.display_name ?? 'Unnamed'}
                    {member.is_admin && <span className="badge-primary ml-2">admin</span>}
                    {isSelf && <span className="badge-neutral ml-2">you</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    joined {timeAgo(member.created_at)} · {member.invites_remaining} invites left
                    {member.stripe_charges_enabled && ' · payouts active'}
                  </p>
                </div>

                <span className={clsx(STATUS_CLASS[member.status])}>
                  {member.status.replace('_', ' ')}
                </span>

                <input
                  type="number"
                  min={0}
                  max={500}
                  defaultValue={member.invites_remaining}
                  aria-label={`Invites for ${member.display_name ?? 'member'}`}
                  className="input w-20 !px-2 !py-1 text-sm"
                  onBlur={(e) => {
                    const next = Number(e.target.value)
                    if (next !== member.invites_remaining && Number.isFinite(next)) {
                      grant.mutate({ id: member.id, count: next })
                    }
                  }}
                />

                {/* Suspending yourself would lock the last admin out of
                    their own marketplace — the RPC refuses it, and the
                    button is hidden so nobody discovers that the hard way. */}
                {!isSelf && (
                  member.status === 'suspended' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: member.id, status: 'active' })}
                    >
                      Reinstate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger-600"
                      disabled={setStatus.isPending}
                      onClick={() => {
                        const reason = prompt('Why are you suspending this member?')
                        if (reason === null) return
                        setStatus.mutate({ id: member.id, status: 'suspended', reason })
                      }}
                    >
                      Suspend
                    </Button>
                  )
                )}
              </Card>
            )
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">
        Suspending a member hides all their listings immediately and blocks new checkouts
        against them. Orders they have already been paid for stay their responsibility.
      </p>
    </div>
  )
}
