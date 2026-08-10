// ================================================================
// Been-go — connect-onboarding
//
// Gets a seller from "signed up" to "can be paid". Stripe Connect
// Express: Stripe hosts the identity, bank-account, and tax collection,
// so no bank details ever reach this codebase or its database.
//
// Two actions:
//   onboard   → create the account if needed, return a one-time
//               onboarding link
//   dashboard → return a login link to the seller's Express dashboard
//               (payout history, bank changes)
//
// Required secret: STRIPE_SECRET_KEY. Optional: APP_URL.
// ================================================================

import { handler, json, serviceClient, requireUser, stripe, APP_URL, HttpError } from '../_shared/lib.ts'

Deno.serve(handler(async (req) => {
  const db = serviceClient()
  const { user, profile } = await requireUser(req, db)

  const { action = 'onboard' } = await req.json().catch(() => ({}))

  let accountId: string | null = profile.stripe_account_id

  if (!accountId) {
    if (action === 'dashboard') {
      throw new HttpError(400, 'Set up payouts first')
    }

    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email,
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { profile_id: profile.id },
    })

    accountId = account.id

    // Write it back immediately. If the account link step below fails,
    // the next attempt must reuse this account rather than orphaning it
    // and creating a second one on the Stripe side.
    const { error } = await db
      .from('profiles')
      .update({ stripe_account_id: accountId })
      .eq('id', profile.id)

    if (error) throw new HttpError(500, 'Could not save your payout account')
  }

  if (action === 'dashboard') {
    const link = await stripe.accounts.createLoginLink(accountId)
    return json({ url: link.url })
  }

  // Account links are single-use and short-lived by design — always mint
  // a fresh one rather than caching.
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${APP_URL}/account?payouts=refresh`,
    return_url: `${APP_URL}/account?payouts=done`,
    type: 'account_onboarding',
  })

  return json({ url: link.url })
}))
