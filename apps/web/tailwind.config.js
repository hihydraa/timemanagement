/** @type {import('tailwindcss').Config} */
// Brand palette มาจากมาสคอต Dobby: เขียวหมวก (#4a7864), ครีมเสื้อ (#ecd9bc), น้ำตาลหนัง (#693d24), ทองกระดิ่ง (#eea844)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5f1',
          100: '#d9e8e0',
          200: '#b5d2c3',
          300: '#88b3a0',
          400: '#6a9985',
          500: '#4a7864',
          600: '#3d6552',
          700: '#315243',
          800: '#284237',
          900: '#1f342b',
          950: '#12201a',
        },
        gold: { 400: '#f3b95a', 500: '#eea844', 600: '#c98a24', 700: '#8a5a0c' },
        bark: { 500: '#a65c39', 700: '#693d24' },
        // เทาโทนอุ่น/เขียวเทา แทน slate เดิม: 50=ครีมพื้นหลัง … 900=เขียวเข้ม (พื้นหลังโหมดมืด/ตัวอักษรโหมดสว่าง)
        slate: {
          50: '#fbf7ee',
          100: '#f3ecdb',
          200: '#e6dcc4',
          300: '#cfc3a6',
          400: '#9aa79d',
          500: '#65766b',
          600: '#4f6056',
          700: '#3b4a42',
          800: '#2a372f',
          900: '#1c2822',
          950: '#121b17',
        },
      },
      fontFamily: {
        display: ['"Noto Sans Thai"', 'ui-rounded', 'system-ui', 'sans-serif'],
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
