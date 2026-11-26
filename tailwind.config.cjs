/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: { DEFAULT: 'hsl(var(--primary) / <alpha-value>)', foreground: 'hsl(var(--primary-foreground) / <alpha-value>)' },
        muted: { DEFAULT: 'hsl(var(--muted) / <alpha-value>)', foreground: 'hsl(var(--muted-foreground) / <alpha-value>)' },
        card: { DEFAULT: 'hsl(var(--card) / <alpha-value>)', foreground: 'hsl(var(--card-foreground) / <alpha-value>)' },
        sidebar: { DEFAULT: 'hsl(var(--sidebar) / <alpha-value>)', foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)' },
        topbar: 'hsl(var(--topbar) / <alpha-value>)',
        track: 'hsl(var(--track) / <alpha-value>)',
        danger: { DEFAULT: 'hsl(var(--danger) / <alpha-value>)', soft: 'hsl(var(--danger-soft) / <alpha-value>)', line: 'hsl(var(--danger-line) / <alpha-value>)' },
        warn: { DEFAULT: 'hsl(var(--warn) / <alpha-value>)', soft: 'hsl(var(--warn-soft) / <alpha-value>)', line: 'hsl(var(--warn-line) / <alpha-value>)' },
        serious: { DEFAULT: 'hsl(var(--serious) / <alpha-value>)', soft: 'hsl(var(--serious-soft) / <alpha-value>)' },
        ok: { DEFAULT: 'hsl(var(--ok) / <alpha-value>)', soft: 'hsl(var(--ok-soft) / <alpha-value>)', line: 'hsl(var(--ok-line) / <alpha-value>)' },
        info: { soft: 'hsl(var(--info-soft) / <alpha-value>)', line: 'hsl(var(--info-line) / <alpha-value>)' },
        /* Paleta de status (fixa): sempre acompanhada de ícone + texto */
        status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
        /* Série de dados (magnitude, matiz único) */
        series: { DEFAULT: '#282C8D', soft: '#cfd1ec' },
        brand: 'hsl(var(--brand) / <alpha-value>)',
        /* Azul-marinho da planilha: só nas partes que reproduzem o documento em papel */
        sheet: '#002060',
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04)', soft: '0 1px 2px rgba(0,0,0,.05)', pop: '0 12px 32px -8px rgba(0,0,0,.18)' },
      borderRadius: { sm: '6px', DEFAULT: '10px', md: '12px', lg: '16px', xl: '20px' },
    },
  },
  plugins: [],
};
