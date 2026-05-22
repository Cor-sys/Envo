/** @type {import('tailwindcss').Config} */
//
// Theme: dark walnut canvas with cream-honey text and warm brass accent.
//
// This is a DARK theme but on a deep wood tone, not slate-grey. Cards are
// LIFTED (slightly lighter than the body) so they read as plaques sitting
// on the board. Text is light cream-honey for high readability without
// the glare of pure white.
//
// Theme tokens override Tailwind's `slate` palette so existing class names
// (`bg-slate-950`, `text-slate-100`, etc.) auto-theme.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50:  '#fef5da',  // brightest cream (rare; near-white for emphasis)
          100: '#f3e1b0',  // primary text — cream honey
          200: '#e5cb8f',  // secondary text
          300: '#cdb072',  // muted (subheadings, captions)
          400: '#a48854',  // placeholder / disabled
          500: '#8a7045',  // tertiary text (timestamps)
          600: '#6b5535',  // hover bg
          700: '#5d4329',  // input borders
          800: '#4d3624',  // surface borders, button bgs
          900: '#3f2c1c',  // surface (LIFTED — lighter than body)
          950: '#2e1f12',  // body — deep walnut
        },
        // Brand accent — brass, brighter than the prior espresso so it
        // shows on the deep walnut. Used for primary buttons + brand only.
        honey: {
          300: '#e6c279',
          400: '#d4a64f',
          500: '#b88532',  // primary buttons
          600: '#956a21',
          700: '#704e15',
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
