import { useState } from 'react'
import { signInWithGoogle } from '@/lib/auth'
import { ErrorNote } from '@/components/ui'

/**
 * Google's mark, inline. lucide-react carries no brand logos, and
 * Google's terms ask for their four-colour G rather than a lookalike,
 * so the path data lives here instead of in an icon import.
 */
function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.3z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.7 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3v-5.7H4.3A22 22 0 0 0 2 24c0 3.6.9 6.9 2.3 9.9l7.4-5.6z" />
      <path fill="#EA4335" d="M24 10.6c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4 29.9 2 24 2 15.4 2 7.9 6.9 4.3 14.1l7.4 5.7c1.7-5.2 6.6-9.2 12.3-9.2z" />
    </svg>
  )
}

/**
 * `next` survives the round trip to Google and back as a query param on
 * the callback URL — the page the user was heading for before they were
 * bounced to /login.
 */
export default function GoogleButton({
  label = 'Continue with Google',
  next,
}: {
  label?: string
  next?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    setError(null)
    setBusy(true)
    try {
      // On success the browser navigates away and never comes back to
      // this component, so `busy` is only ever cleared on failure.
      await signInWithGoogle(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Google')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorNote error={new Error(error)} />}
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      >
        <GoogleMark />
        {busy ? 'Opening Google…' : label}
      </button>
    </div>
  )
}
