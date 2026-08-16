import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'

export default function ThemeToggle({ className }: { className?: string }) {
  // Initialised from the DOM, which the inline script in index.html has
  // already set — so this never disagrees with what is on screen.
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof document === 'undefined' ? 'dark' : getTheme(),
  )

  return (
    <button
      onClick={() => setThemeState(toggleTheme())}
      className={`rounded p-2 text-fg-muted transition-colors hover:bg-panel2 hover:text-fg ${className ?? ''}`}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light' : 'Dark'}
    >
      {theme === 'dark'
        ? <Sun className="h-4 w-4" />
        : <Moon className="h-4 w-4" />}
    </button>
  )
}
