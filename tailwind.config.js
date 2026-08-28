/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './server.js'
  ],
  theme: {
    extend: {
      colors: {
        stihl: {
          orange: '#FF6600',
          dark: '#121824',
          card: '#1F2937'
        }
      },
      fontSize: {
        '2xs': '0.65rem',
        '3xs': '0.55rem'
      }
    }
  },
  plugins: []
};
