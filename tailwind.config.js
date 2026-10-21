/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /* Colours are bridged to the design tokens in src/index.css, so the
         dark and light themes are a channel swap rather than a second
         stylesheet — the same approach as agora.in.net. */
      colors: {
        canvas: 'rgb(var(--bg-rgb) / <alpha-value>)',
        'canvas-soft': 'rgb(var(--bg-soft-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2-rgb) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3-rgb) / <alpha-value>)',
        ink: 'rgb(var(--text-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        faint: 'rgb(var(--faint-rgb) / <alpha-value>)',
        brand: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'brand-deep': 'rgb(var(--accent-deep-rgb) / <alpha-value>)',
        'brand-blue': 'rgb(var(--blue-rgb) / <alpha-value>)',
        'brand-lav': 'rgb(var(--lavender-rgb) / <alpha-value>)',
        danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
        positive: 'rgb(var(--success-rgb) / <alpha-value>)',
        /* Hairlines: white-based in dark, slate-based in light. */
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderColor: {
        DEFAULT: 'rgb(var(--line-rgb) / 0.08)',
      },
      borderRadius: {
        '4xl': '1.75rem',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-card)',
        glow: 'var(--shadow-glow)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s var(--ease) both',
        'rise-in': 'rise-in 0.45s var(--ease) both',
      },
    },
  },
  plugins: [],
};
