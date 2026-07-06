/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        surface: '#050505',
        border: '#262626',
        accent: '#ffffff',
      },
      boxShadow: {
        'vercel': '0 0 0 1px rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.32)',
      },
    },
  },
  plugins: [],
};
