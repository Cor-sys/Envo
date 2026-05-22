/** @type {import('tailwindcss').Config} */
//
// Theme: midnight slate canvas, cool gray-blue text, warm brass accent.
//
// User-picked palette: body #2c3e50 + primary text #d0d9df. Cards are
// LIFTED (slightly lighter than the body) so they read as plaques on
// the slate. Brass accent stays — warm-on-cool contrast (brass fittings
// on a slate console).
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
        // Brand accent — warm brass. Stays warm so it pops on the cool bg.
        // Used only for primary buttons + brand mark.
        honey: {
          300: '#e6c279',
          400: '#d4a64f',
          500: '#b88532',  // primary button bg
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
