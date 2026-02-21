/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF9B71',
          50: '#FFF4EF',
          100: '#FFE9DF',
          200: '#FFD3BF',
          300: '#FFBD9F',
          400: '#FFA77F',
          500: '#FF9B71',
          600: '#FF7C4D',
          700: '#FF5D29',
          800: '#E54400',
          900: '#B33600',
        },
        chakra: {
          health: '#FF6B6B',
          habit: '#4ECDC4',
          development: '#45B7D1',
          creativity: '#FFA07A',
          relationship: '#98D8C8',
          mindfulness: '#B19CD9',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'Pretendard',
          'Roboto',
          'Noto Sans KR',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
