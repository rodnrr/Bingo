import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { sendPhoneCode, toE164, verifyPhoneCode } from '@/lib/auth'
import { Button, ErrorNote } from '@/components/ui'

const RESEND_SECONDS = 30

/**
 * Phone sign-in, both halves of it.
 *
 * There is no separate "sign up with phone": Supabase creates the
 * account on first verification, and the profile trigger drops the new
 * user at 'pending_invite' like everyone else. So this component is the
 * same on /login and /signup, and the invite gate is still what decides
 * whether a verified number gets anything.
 */
export default function PhoneSignIn({ onVerified }: { onVerified: () => void }) {
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)

  // Resend is rate limited upstream too; the countdown is so the button
  // says why it is unavailable instead of just failing.
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus()
  }, [step])

  const send = async () => {
    setError(null)
    setBusy(true)
    try {
      await sendPhoneCode(phone)
      setStep('code')
      setCooldown(RESEND_SECONDS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setError(null)
    setBusy(true)
    try {
      await verifyPhoneCode(phone, code)
      onVerified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not work')
      setCode('')
      codeInput.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  if (step === 'phone') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); send() }}
      >
        {error && <ErrorNote error={new Error(error)} />}

        <div>
          <label className="label" htmlFor="phone">Phone number</label>
          <input
            id="phone"
            type="tel"
            className="input"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="hint">
            We text you a 6-digit code. Outside the US? Start with your country
            code, like +44.
          </p>
        </div>

        <Button type="submit" fullWidth disabled={busy || phone.trim().length < 7}>
          {busy ? 'Sending…' : 'Text me a code'}
        </Button>
      </form>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); verify() }}
    >
      {error && <ErrorNote error={new Error(error)} />}

      <p className="text-sm text-gray-600 dark:text-slate-400">
        Code sent to <strong>{toE164(phone)}</strong>.
      </p>

      <div>
        <label className="label" htmlFor="otp">6-digit code</label>
        <input
          id="otp"
          ref={codeInput}
          className="input text-center font-mono text-lg tracking-[0.4em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          required
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ''))}
        />
      </div>

      <Button type="submit" fullWidth disabled={busy || code.length < 6}>
        {busy ? 'Checking…' : 'Sign in'}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => { setStep('phone'); setCode(''); setError(null) }}
          className="flex items-center gap-1 text-gray-600 hover:underline dark:text-slate-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Change number
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy || cooldown > 0}
          className="text-primary-600 hover:underline disabled:text-gray-400 disabled:no-underline"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  )
}
