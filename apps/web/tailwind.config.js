/** @type {import('tailwindcss').Config} */
// Brand palette มาจากมาสคอต Dobby: เขียวหมวก (#4a7864), ครีมเสื้อ (#ecd9bc), น้ำตาลหนัง (#693d24), ทองกระดิ่ง (#eea844)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4f0',
          100: '#e4eee7',
          200: '#c5d9cb',
          300: '#9dbba8',
          400: '#6f9a82',
          500: '#4f7a62',
          600: '#3f6650',
          700: '#2c4a39',
          800: '#243d2f',
          900: '#1b2e23',
          950: '#12201a',
        },
        gold: { 400: '#f3b95a', 500: '#eea844', 600: '#c98a24', 700: '#8a5a0c' },
        bark: { 500: '#a65c39', 700: '#693d24' },
        // เทาโทนอุ่น/เขียวเทา แทน slate เดิม: 50=ครีมพื้นหลัง … 900=เขียวเข้ม (พื้นหลังโหมดมืด/ตัวอักษรโหมดสว่าง)
        slate: {
          50: '#faf7ef',
          100: '#f3eedf',
          200: '#e6dfcb',
          300: '#d3cab0',
          400: '#9aa39a',
          500: '#5f6a5c',
          600: '#4a5649',
          700: '#36443a',
          800: '#2a362f',
          900: '#1f2b25',
          950: '#141d19',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans Thai"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['"Noto Sans Thai"', 'system-ui', 'sans-serif'],
      },
      boxShadow: { soft: '0 1px 2px rgb(60 45 20 / 0.08), 0 4px 14px rgb(60 45 20 / 0.08)' },
      keyframes: {
        bob: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: { bob: 'bob 2.4s ease-in-out infinite', pop: 'pop .28s ease-out both' },
    },
  },
};
