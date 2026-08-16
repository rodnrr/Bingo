import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { chipClass } from './chipClass'

// ================================================================
// Chips and the rail they sit in.
//
// This exists because the same chip was five copy-pasted class strings
// across BrowsePage, AdminPage, AdminReports, LegalPage and the preview
// — which is precisely how one of them kept a white background through
// a theme change while the others did not. One definition, five callers.
//
// The visual belongs to the same family as .nav-link-active: the
// selected state is a lit top edge and amber text, not a solid fill.
// A filled chip competes with the primary button for the eye, and on a
// page with twelve of them that is a lot of shouting.
// ================================================================

/** The lit edge on a selected chip. Render inside the chip. */
export function ChipMark({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-1.5 top-[-1px] h-px bg-primary"
      style={{ boxShadow: '0 0 8px 0 rgb(var(--primary) / 0.9)' }}
    />
  )
}

interface ChipProps {
  active?: boolean
  icon?: LucideIcon
  count?: number
  onClick?: () => void
  children: ReactNode
}

export function Chip({ active = false, icon: Icon, count, onClick, children }: ChipProps) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={chipClass(active)}>
      <ChipMark active={active} />
      {Icon && (
        <Icon
          className={clsx(
            'h-3.5 w-3.5 transition-colors',
            active ? 'text-primary' : 'text-fg-subtle group-hover:text-primary',
          )}
        />
      )}
      <span>{children}</span>
      {count !== undefined && (
        <span className={clsx('num text-[10px]', active ? 'text-primary/70' : 'text-fg-subtle')}>
          {count}
        </span>
      )}
    </button>
  )
}

/**
 * Horizontal rail. Twelve categories wrap into three ragged rows on a
 * phone, which reads as clutter and pushes the listings below the fold;
 * scrolling keeps it one line.
 *
 * The edge fades are driven by actual scroll position rather than shown
 * unconditionally — a fade on an edge you have already reached is a lie
 * about there being more.
 */
export function ChipRail({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({
      left:  el.scrollLeft > 4,
      right: max > 4 && el.scrollLeft < max - 4,
    })
  }, [])

  useEffect(() => {
    measure()
    const el = ref.current
    if (!el) return

    // Content can arrive after mount (categories are fetched), and the
    // rail's scrollability changes with the viewport.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)

    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, children])

  const fade = (side: 'left' | 'right') => (
    <span
      aria-hidden
      className={clsx(
        'pointer-events-none absolute inset-y-0 w-10 transition-opacity duration-200',
        side === 'left' ? 'left-0' : 'right-0',
        edges[side] ? 'opacity-100' : 'opacity-0',
      )}
      style={{
        background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, rgb(var(--base)), transparent)`,
      }}
    />
  )

  return (
    <div className={clsx('relative', className)}>
      <div
        ref={ref}
        onScroll={measure}
        className="scrollbar-none flex gap-1.5 overflow-x-auto scroll-smooth pb-0.5"
      >
        {children}
      </div>
      {fade('left')}
      {fade('right')}
    </div>
  )
}
