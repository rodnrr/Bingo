import clsx from 'clsx'

/**
 * The chip's look, as a bare function so it can dress a NavLink as
 * easily as a button. It lives apart from Chip.tsx because a module
 * that exports both components and plain functions breaks fast refresh.
 *
 * The selected state is a lit edge and amber text, never a solid fill:
 * a filled chip competes with the primary button for the eye, and there
 * are twelve of them on the browse page.
 */
export function chipClass(active: boolean): string {
  return clsx(
    'group relative inline-flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5',
    'text-xs font-medium transition-all duration-150 border',
    active
      ? 'border-primary/45 bg-primary/10 text-primary'
      : 'border-line/10 bg-panel2/70 text-fg-muted hover:border-primary/25 hover:text-fg',
  )
}
