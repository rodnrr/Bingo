# About these documents

**Read this before you launch. It is the most important file in this folder.**

## These are drafts, not legal advice

I am not a lawyer, and these documents have not been reviewed by one. They are a
careful, complete-looking starting point written to reflect what Been-go!
actually does — which is more than most templates give you — but that is not the
same as being fit to rely on.

Before real money moves between real people, **have a lawyer in your
jurisdiction read them.** For a small marketplace this is usually a one-off
review, not an ongoing expense, and it is much cheaper than the alternative.

The parts most likely to need real legal input:

| Section | Why it matters |
|---|---|
| Terms §13, liability cap | Enforceability varies enormously by jurisdiction |
| Terms §15, disputes | Arbitration clauses are void or restricted in many places — this one is deliberately left as a marked placeholder rather than copied from another site |
| Privacy, retention periods | Tax and accounting minimums differ by country |
| Privacy, GDPR/CCPA claims | Whether they apply to you depends on where your members are |
| Rules, prohibited items | Some entries are legal to sell in some places and not others |

## Fill in the placeholders first

Search all three documents for `[` and replace every bracketed placeholder:

- `[LEGAL ENTITY NAME]` — the entity that operates Been-go! (you personally, or
  an LLC/Ltd if you form one — forming one is worth asking your lawyer about,
  since it is the thing that separates the marketplace's liabilities from your
  personal ones)
- `[REGISTERED ADDRESS]`
- `[SUPPORT EMAIL]` — also set this in `platform_settings.support_email`
- `[STATE/COUNTRY]` and `[VENUE]` — governing law and courts
- `[AMOUNT, e.g. US$100]` — the liability cap floor
- `[REVIEW WITH COUNSEL BEFORE LAUNCH]` — the arbitration block in Terms §15;
  either replace it with a clause your lawyer drafts, or delete it

**Nothing enforces this.** The app will happily ship with `[SUPPORT EMAIL]`
rendered on screen. Grep before you deploy:

```bash
grep -n '\[' src/legal/*.md
```

## Changing the documents later

Terms live in two places that must move together:

1. The `**Version YYYY-MM-DD**` line at the top of each document, and
2. `platform_settings.terms_version` in the database.

The order matters:

1. Edit the documents and bump their version lines.
2. **Deploy.**
3. *Then* run `UPDATE platform_settings SET terms_version = 'YYYY-MM-DD';`

Do it in that order and every member is asked to accept a version they can
actually read. Do it backwards and, for the length of your deploy, members are
asked to agree to text the app is still serving the old copy of.

`accept_terms()` refuses any version that is not the current one, so a stale
browser tab cannot record consent to superseded text.

## What acceptance actually records

`terms_acceptances` is append-only — there is no UPDATE or DELETE policy on it
for anyone, admins included. One row per member per version, with a timestamp.

That table is the thing you would produce if a member ever disputed that they
agreed. Do not add a way to edit it.
