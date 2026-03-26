/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        avion: {
          bg: {
            primary: '#0a0f1a',
            secondary: '#0d1321',
            tertiary: '#1e3a5f',
          },
          border: '#1e3a5f',
          safe: '#22c55e',
          caution: '#fbbf24',
          alert: '#ef4444',
          info: '#00d4ff',
          text: {
            primary: '#ffffff',
            secondary: '#6b7280',
            accent: '#00d4ff',
          }
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
