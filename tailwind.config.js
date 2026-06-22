export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#f5f5f5',
          surface: '#ffffff',
          raised: '#efefef',
          border: '#e2e2e2',
          accent: '#111111',
          bright: '#444444',
          muted: '#888888',
          text: '#111111',
          win: '#16a34a',
          loss: '#dc2626',
          be: '#ca8a04',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    }
  },
  plugins: [],
}
