/** @type {import('tailwindcss').Config} */
//
// Theme: warm cedar canvas with honey-toned text.
//
// We deliberately OVERRIDE Tailwind's `slate` palette with wood + honey
// tones so every existing `bg-slate-950` / `text-slate-100` / `border-slate-800`
// in the codebase auto-themes without touching component files. The scale
// keeps Tailwind's dark-mode mental model — slate-950 = canvas, slate-100 =
// primary text — just shifted onto warmer hues.
//
// `honey` is added as a brand-accent palette. Components that previously
// used `orange-X` (the prior copper accent) now reference `honey-X`. Status
// pills (emerald/amber/red) are NEVER themed — they're semantic.
//
// Surface treatment is INSET: slate-900 is slightly DARKER than slate-950
// so cards read as recessed wood panels, not floating plaques.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50:  '#fdf1d3',  // cream
          100: '#f6dcab',  // honey  ← primary text on the wood canvas
          200: '#efce97',  // slightly muted honey
          300: '#e0b87a',  // muted honey (subheadings)
          400: '#c69a64',  // mid honey-tan (labels, placeholders)
          500: '#a07a4a',  // tertiary text (timestamps, captions)
          600: '#8d5638',  // hover wood, lighter highlights
          700: '#5e3623',  // inputs / divider borders
          800: '#4f2d1c',  // surface borders, button outlines
          900: '#6a3c28',  // surface (INSET, slightly darker than body)
          950: '#7a4730',  // body canvas — the "light red wood"
        },
        // Brand accent. Replaces the prior orange/copper. Used for primary
        // buttons, NavLink active state, wordmark dot, links.
        honey: {
          300: '#f3d28a',
          400: '#e7ba56',
          500: '#d4a017',
          600: '#b8860b',
          700: '#946a08',
        },
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
