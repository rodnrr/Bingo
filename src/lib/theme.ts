// ================================================================
// Theme
//
// Dark is the default and the design's home. Light exists because
// phones in sunlight exist, and because not everyone reads white-on-
// black comfortably for long.
//
// The class is applied by an inline script in index.html *before* first
// paint. This module only keeps the choice in sync afterwards — if it
// were responsible for the initial application, every load would flash
// the wrong theme.
// ================================================================

export type Theme = 'dark' | 'light'

const KEY = 'beengo-theme'

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function setTheme(theme: Theme): void {
  const dark = theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  // Tells the browser to paint form controls and scrollbars to match.
  document.documentElement.style.colorScheme = theme

  // Keeps the phone's status bar from fighting the page.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#08090d' : '#f8f9fb')

  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private mode, or storage disabled. The theme still applies for
    // this session; it just will not be remembered.
  }
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}
