/** @type {import('tailwindcss').Config} */
//
// Theme: aged kraft-paper canvas with walnut text and espresso-brass accent.
//
// Overrides Tailwind's `slate` palette with a kraft→walnut gradient. Every
// existing `bg-slate-950` / `text-slate-100` / `border-slate-800` in the
// codebase auto-themes through this one file. Surfaces (slate-900) are
// DARKER than the body (slate-950) on purpose — cards read as recessed
// panels into the wood, not floating plaques.
//
// Status pills (emerald/amber/red) stay semantic. They render as quiet
// dot+text via the .pill-* CSS in index.css.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50:  '#0f0a04',  // near-black (rare — for max-contrast text)
          100: '#241a0c',  // primary text — deep walnut
          200: '#3a2b17',  // slightly muted walnut
          300: '#4d3a23',  // muted walnut (subheadings)
          400: '#6e5535',  // mid kraft (labels, placeholders)
          500: '#7d6440',  // muted (captions, timestamps)
          600: '#927a4d',  // hairline dividers / borders
          700: '#a0875a',  // input borders (slightly stronger than 600)
          800: '#927a4d',  // surface borders — same as hairline for consistency
          900: '#b39966',  // surface (cards) — DARKER than body, recessed
          950: '#c4ad7a',  // body — aged kraft paper
        },
        // Brand accent — espresso brass. Quieter than honey, better
        // contrast on the warmer body.
        honey: {
          300: '#a8893f',
          400: '#8b6e2a',
          500: '#6b4d1a',  // primary buttons + brand mark
          600: '#553c10',
          700: '#3f2c08',
        },
      },
      maxWidth: {
        app: '720px',  // desktop content cap — keeps cards sensibly sized
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
