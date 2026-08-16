import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Check } from 'lucide-react'
import { createInvite, listInvites, revokeInvite } from '@/lib/api'
import { refreshProfile } from '@/lib/auth'
import { timeAgo } from '@/lib/format'
import { useAuthStore, toast } from '@/lib/store'
import {
  Button, Card, Container, EmptyState, ErrorNote, LoadingBlock, PageHeading,
} from '@/components/ui'
import type { Invite } from '@/types'

function inviteState(invite: Invite): { label: string; className: string; live: boolean } {
  if (invite.revoked_at) return { label: 'revoked', className: 'badge-danger', live: false }
  if (invite.used_count >= invite.max_uses) return { label: 'used', className: 'badge-neutral', live: false }
  if (new Date(invite.expires_at) < new Date()) return { label: 'expired', className: 'badge-neutral', live: false }
  return { label: 'ready', className: 'badge-success', live: true }
}

export default function InvitesPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['invites'],
    queryFn: listInvites,
  })

  const create = useMutation({
    mutationFn: () => createInvite(email, note),
    onSuccess: async () => {
      setEmail('')
      setNote('')
      // The allowance lives on the profile, and create_invite just spent one.
      await refreshProfile()
      queryClient.invalidateQueries({ queryKey: ['invites'] })
      toast.success('Invite code created')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] })
      toast.success('Invite revoked')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const copyLink = async (code: string) => {
    const link = `${window.location.origin}/signup?code=${code}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(code)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard is blocked in plenty of mobile browser contexts; the
      // code is on screen either way, so say so rather than failing silently.
      toast.info(`Copy this link: ${link}`)
    }
  }

  const remaining = profile?.invites_remaining ?? 0

  return (
    <Container className="max-w-3xl">
      <PageHeading
        title="Invites"
        subtitle={`You have ${remaining} invite${remaining === 1 ? '' : 's'} left. Spend them on people you would vouch for.`}
      />

      <Card className="mb-6">
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); create.mutate() }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="email">Their email (optional)</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="friend@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="hint">Just a reminder for you — no email is sent automatically.</p>
            </div>
            <div>
              <label className="label" htmlFor="note">Note (optional)</label>
              <input
                id="note"
                className="input"
                placeholder="Sam from the shop"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" disabled={create.isPending || remaining <= 0}>
            {create.isPending ? 'Creating…' : 'Create invite code'}
          </Button>

          {remaining <= 0 && (
            <p className="text-sm text-fg-subtle">
              You are out of invites. An admin can top you up.
            </p>
          )}
        </form>
      </Card>

      {error && <ErrorNote error={error} />}

      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState title="No invites yet" body="Create one above and send the link to someone." />
      ) : (
        <div className="space-y-2">
          {data.map((invite) => {
            const state = inviteState(invite)
            return (
              <Card key={invite.id} className="flex flex-wrap items-center gap-3 !p-3">
                <code className="rounded-lg bg-panel2 px-3 py-1.5 font-mono text-sm tracking-widest ">
                  {invite.code}
                </code>

                <div className="min-w-0 flex-1 text-xs text-fg-subtle">
                  <p>
                    {invite.email || invite.note || 'No label'} · created {timeAgo(invite.created_at)}
                  </p>
                  <p>
                    {state.live
                      ? `expires ${timeAgo(invite.expires_at)}`
                      : `${invite.used_count}/${invite.max_uses} used`}
                  </p>
                </div>

                <span className={state.className}>{state.label}</span>

                {state.live && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => copyLink(invite.code)}>
                      {copied === invite.code
                        ? <><Check className="h-3.5 w-3.5" /> Copied</>
                        : <><Copy className="h-3.5 w-3.5" /> Link</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(invite.id)}
                    >
                      Revoke
                    </Button>
                  </>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </Container>
  )
}
