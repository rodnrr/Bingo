import type { Config } from 'tailwindcss'

// ================================================================
// Been-go! — palette and scales
//
// The colour set is the original one: gray-50 page, white cards,
// orange-600 brand, teal accent. The structure the redesign added —
// semantic tokens, mono numerals, tighter radii — stays; only the
// colours went back.
//
// Semantic tokens (canvas/panel/line/fg/…) resolve to CSS variables
// defined in globals.css, so light and dark are one set of classes and
// there is no dark: variant to forget.
//
// The page colour is keyed `canvas`, not `base`. A colour named `base`
// also generates a `text-base` utility, which collides with the core
// font-size one and silently paints every heading the background
// colour — that shipped for one screenshot before it was caught.
// ================================================================

/** Token → `rgb(var(--x) / <alpha>)`, so `bg-panel/60` works. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: token('base'),     // page
        panel:  token('panel'),    // cards
        panel2: token('panel2'),   // inputs, wells
        line:   token('line'),     // hairlines — always used with an alpha
        fg:     token('fg'),
        'fg-muted':  token('fg-muted'),
        'fg-subtle': token('fg-subtle'),
        accent: token('accent'),

        primary: {
          DEFAULT: token('primary'),
          fg:  token('primary-fg'),
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },

        success: { DEFAULT: '#16a34a', 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a' },
        warning: { DEFAULT: '#d97706', 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706' },
        danger:  { DEFAULT: '#dc2626', 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626' },
      },

      fontFamily: {
        // Space Grotesk has the slightly squared counters that read as
        // technical without tipping into costume.
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        // Every price, code, and stat is set in this. It is the single
        // biggest reason the interface reads as an instrument.
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      // Small and precise. rounded-2xl is friendly; this is not that.
      borderRadius: {
        DEFAULT: '4px',
        md: '5px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '14px',
      },

      letterSpacing: {
        micro: '0.14em',
      },

      screens: { xs: '375px' },

      boxShadow: {
        panel: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
        lift:  '0 4px 6px -1px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.10)',
        // Kept so the tokens still resolve, but scaled to nothing —
        // the original set had no bloom anywhere.
        glow:     '0 0 0 1px rgb(var(--primary) / 0.25)',
        'glow-sm': '0 0 0 0 transparent',
      },

      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, rgb(var(--base) / 0) 0%, rgb(var(--base) / 1) 78%)',
      },

      animation: {
        'fade-in':  'fadeIn 0.18s ease-out',
        'slide-up': 'slideUp 0.22s cubic-bezier(0.2, 0.7, 0.3, 1)',
        sweep:      'sweep 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
      },

      keyframes: {
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%':   { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
        // The line that travels across a loading bar.
        sweep: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.35' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
