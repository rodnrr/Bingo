import type { Config } from 'tailwindcss'

export default {
  // Same 'class' strategy StreetRise uses: dark mode only activates when a
  // .dark class is on <html>. No toggle ships yet — structural readiness only.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Been-go brand palette — sunrise orange, so it reads as a sibling of
        // StreetRise (same scale shape) without being the same product.
        primary: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c', // brand orange
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        accent: {
          50:  '#f0fdfa',
          500: '#14b8a6',
          600: '#0d9488',
        },
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      screens: {
        xs: '375px',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(1rem)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
