// ================================================================
// RiseBay — UI primitives
//
// Kept in one file on purpose: six small presentational components
// that always change together. Split them out the day one of them
// grows real behaviour.
// ================================================================

import clsx from 'clsx'
import { Link, type LinkProps } from 'react-router-dom'
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ── Feedback ─────────────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={clsx(
        'h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600',
        className,
      )}
    />
  )
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function EmptyState({ title, body, action }: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center gap-3 py-14 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="max-w-md text-sm text-gray-600 dark:text-slate-400">{body}</p>}
      {action}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <div className="rounded-xl border border-danger-500/30 bg-danger-50 px-4 py-3 text-sm text-danger-600">
      {message}
    </div>
  )
}
