/** @type {import('tailwindcss').Config} */
//
// Theme: midnight slate canvas, cool gray-blue text, warm clay accent,
// sage for positive states. Tuned to match the campus map illustration —
// slate buildings, sage green-spaces, sandy/clay walkways.
//
// Slate canvas + cool text are user-locked (#2c3e50 / #d0d9df). The clay
// accent (was 'honey') is pushed slightly more orange so it reads as warm
// clay rather than yellow brass — keyword name stays `honey` so the
// hundreds of existing bg-honey-* / text-honey-* references don't need a
// codemod. The new `sage` palette is the green found in the map's
// green-space tiles; available for future use but not wired into the
// existing pill-ok styling (emerald still owns OK/IN/transaction green).
//
// Theme tokens override Tailwind's `slate` palette so existing classes
// (bg-slate-950, text-slate-100, border-slate-800) auto-theme.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50:  '#e8edf0',  // brightest cool — emphasis text
          100: '#d0d9df',  // primary text — soft gray-blue (user pick)
          200: '#c3cdd9',  // secondary text
          300: '#b3becc',  // muted (subheadings)
          400: '#95a3b6',  // placeholders, labels
          500: '#7a8aa0',  // tertiary text (captions, timestamps)
          600: '#5d7186',  // hover bg, lighter highlights
          700: '#4a5d72',  // input borders
          800: '#3c5063',  // surface borders, secondary-button bg
          900: '#34495e',  // surface (LIFTED — lighter than body)
          950: '#2c3e50',  // body — midnight slate (user pick)
        },
        // Brand accent — warm clay/terracotta. Reads as orange against the
        // cool slate canvas. Mapped under the legacy `honey` key so the
        // existing bg-honey-* / text-honey-* class usage keeps working.
        honey: {
          300: '#eab576',  // was #e6c279 — less yellow, more orange
          400: '#dc9a48',  // was #d4a64f — warmer clay
          500: '#c87f3d',  // primary button bg — clay/terracotta
          600: '#a46428',  // hover/active
          700: '#7c4a17',  // pressed
        },
        // Sage — green-space tone from the map illustration. Not wired into
        // existing pills (those still use emerald) so this is opt-in for the
        // upcoming Map tab.
        sage: {
          300: '#a3b894',
          400: '#86a075',
          500: '#5d7250',  // primary sage — matches map's grass tiles
          600: '#465a3d',
          700: '#33422d',
        },
      },
      maxWidth: {
        app: '720px',
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
