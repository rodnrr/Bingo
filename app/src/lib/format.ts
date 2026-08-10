import { formatDistanceToNow } from 'date-fns'

/**
 * Cents → "$42.00". Everything in this app stores money as integer
 * cents; this is the only place that turns it into something a person
 * reads, and the only place that should.
 */
export function money(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

/**
 * "$42.00" or "42" → 4200. Returns null for anything that is not a
 * usable amount, so callers can show a field error instead of quietly
 * listing something for $0.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '')
  if (!cleaned) return null

  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value) || value < 0) return null

  return Math.round(value * 100)
}

export function timeAgo(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
