/** @type {import('tailwindcss').Config} */
//
// Theme: pale pine canvas with walnut text and a muted brass accent.
//
// The whole app is built around Tailwind's `slate` palette. We override it
// here with a pine→walnut gradient (light theme — pale at the body, dark
// at the text end) so every existing `bg-slate-950` / `text-slate-100`
// auto-themes without touching component files.
//
// Mental model: in dark mode, slate-950 was "darkest canvas" and slate-100
// was "lightest text". In light mode we keep the SAME class meanings but
// flip the underlying hex values — slate-950 is now the lightest canvas
// (pine cream) and slate-100 is the darkest text (walnut). The numeric
// scale is now "from text-y to canvas-y" rather than "dark to light".
//
// Status pills (emerald/amber/red) are NOT theme tokens — they're semantic.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50:  '#1f1b14',  // very dark walnut (rare; for max-contrast text on light)
          100: '#3d2b1a',  // walnut — primary text on the pine canvas
          200: '#4a3722',  // slightly muted walnut
          300: '#6e5638',  // muted walnut (subheadings)
          400: '#9c8156',  // tan (labels, placeholders)
          500: '#b09870',  // lighter tan (tertiary text, captions)
          600: '#c9b787',  // hover/highlight bg
          700: '#d8c692',  // input borders
          800: '#e6d6a8',  // hairline dividers, surface borders
          900: '#fbf5e3',  // surface (cards) — barely-lifted from body
          950: '#f5ead2',  // body canvas — pale pine cream
        },
        // Brand accent. Muted brass — used only for primary buttons + a
        // few small accents. Deliberately quieter than the prior copper/
        // honey so it doesn't fight the soft pine canvas.
        honey: {
          300: '#c9a460',
          400: '#a07c3a',
          500: '#8d6a2e',  // primary button bg
          600: '#7a5a23',
          700: '#5e4416',
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
