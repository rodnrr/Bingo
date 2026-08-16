import clsx from 'clsx'
import { X } from 'lucide-react'
import { useToastStore } from '@/lib/store'

const TONE: Record<string, string> = {
  success: 'bg-success text-white',
  error:   'bg-danger text-white',
  info:    'bg-fg text-canvas',
}

export default function ToastContainer() {
  const { toasts, remove } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      // Errors interrupt; successes wait their turn.
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className={clsx(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3',
            'text-sm font-medium shadow-lg animate-slide-up',
            TONE[t.type],
          )}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
