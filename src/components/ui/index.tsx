// ================================================================
// Been-go! — UI primitives
//
// Kept in one file on purpose: small presentational components that
// always change together. Split them out the day one grows real
// behaviour.
// ================================================================

import clsx from 'clsx'
import { Link, type LinkProps } from 'react-router-dom'

export { Chip, ChipRail, ChipMark } from './Chip'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'

// ── Button ───────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'default' | 'lg'

const VARIANT_CLASS: Record<Variant, string> = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  ghost:     'btn-ghost',
  danger:    'btn-danger',
}

const SIZE_CLASS: Record<Size, string> = {
  sm:      'btn-sm',
  default: '',
  lg:      'btn-lg',
}

interface CommonProps {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  className?: string
  children: ReactNode
}

type ButtonAsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined; href?: undefined }
type ButtonAsLink = CommonProps &
  Omit<LinkProps, 'className' | 'children'> & { href?: undefined }
type ButtonAsAnchor = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { to?: undefined; href: string }

export function Button({
  variant = 'primary', size = 'default', fullWidth, className, children, ...rest
}: ButtonAsButton | ButtonAsLink | ButtonAsAnchor) {
  const classes = clsx(VARIANT_CLASS[variant], SIZE_CLASS[size], fullWidth && 'w-full', className)

  if ('to' in rest && rest.to !== undefined) {
    const { to, ...linkRest } = rest as ButtonAsLink
    return <Link to={to} className={classes} {...linkRest}>{children}</Link>
  }

  if ('href' in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest as ButtonAsAnchor
    return <a href={href} className={classes} {...anchorRest}>{children}</a>
  }

  return (
    <button className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  )
}

// ── Layout ───────────────────────────────────────────────────────

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('card', className)}>{children}</div>
}

export function PageHeading({ title, subtitle, action }: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** Wide-tracked micro caps with a fading rule — section markers. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('eyebrow', className)}>{children}</p>
}

// ── Feedback ─────────────────────────────────────────────────────

/** A sweeping bar rather than a spinner — it matches the instrument look. */
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={clsx('relative h-px w-28 overflow-hidden bg-panel2', className)}
    >
      <span className="absolute inset-y-0 left-0 w-1/4 bg-primary animate-sweep shadow-glow-sm" />
    </div>
  )
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <Spinner />
      <p className="font-mono text-[10px] uppercase tracking-micro text-fg-subtle">{label}</p>
    </div>
  )
}

export function EmptyState({ title, body, action }: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="card hud flex flex-col items-center gap-3 py-16 text-center">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {body && <p className="max-w-md text-sm text-fg-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <div className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </div>
  )
}
