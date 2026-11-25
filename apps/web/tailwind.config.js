/** @type {import('tailwindcss').Config} */
// Brand palette มาจากมาสคอต Dobby: เขียวหมวก (#4a7864), ครีมเสื้อ (#ecd9bc), น้ำตาลหนัง (#693d24), ทองกระดิ่ง (#eea844)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // เขียวซาจ (ทิศทาง A "Meadow"): 600 = ปุ่มหลัก, 50/100 = เขียวจาง (การ์ดเน้น), 300 = มิ้นต์สำหรับตัวหนังสือ/ไอคอนเน้นในโหมดมืด
        brand: {
          50: '#eef6f1',
          100: '#e6f1ea',
          200: '#cfe3d7',
          300: '#86cca6',
          400: '#5fa682',
          500: '#4b8b6b',
          600: '#3f7a5c',
          700: '#326349',
          800: '#264d38',
          900: '#2a3a31',
          950: '#202e27',
        },
        // น้ำเงินคราม (ทิศทาง C "Calm Studio") เป็นสีเสริม: ลิงก์ วงโฟกัส ป้ายข้อมูล สถานะที่เลือก — 100 = ครามจาง, 400 = ครามอ่อน (โหมดมืด)
        iris: {
          50: '#f1f4ff',
          100: '#e7ecff',
          200: '#cdd6ff',
          300: '#aebcff',
          400: '#8ea2ff',
          500: '#5d79ee',
          600: '#3b5bdb',
          700: '#2f49b5',
          800: '#273a8f',
          900: '#222f6e',
          950: '#161e48',
        },
        // เทาเย็น (C): พื้นช่องกรอก/พื้น hover/ช่องว่างในรายการ แยกจากกระดาษอุ่นของพื้นหน้า
        cool: {
          50: '#f7f8fa',
          100: '#eef1f6',
          200: '#e3e6ec',
          300: '#cfd5e0',
          400: '#9aa3b2',
          500: '#5b6270',
        },
        // หมึก (ตัวหนังสือโหมดสว่าง) และดำ (ชั้นลึกสุดของโหมดมืด)
        ink: '#14161b',
        black: '#0f1115',
        gold: { 400: '#f3b95a', 500: '#eea844', 600: '#c98a24', 700: '#8a5a0c' },
        bark: { 500: '#a65c39', 700: '#693d24' },
        // เทากลาง "อุ่น" ไม่มีเขียวผสม: 50 = พื้นกระดาษ (โหมดสว่าง) … 800/900 = ถ่านอุ่น (การ์ด/พื้นโหมดมืด)
        slate: {
          50: '#fbf8f1',
          100: '#f4efe4',
          200: '#e8e1d1',
          300: '#d6ccb6',
          400: '#a39d8f',
          500: '#6f6b5f',
          600: '#55524a',
          700: '#3d3a35',
          800: '#262421',
          900: '#1c1b19',
          950: '#131211',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans Thai"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['Anuphan', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(60 45 20 / 0.08), 0 4px 14px rgb(60 45 20 / 0.08)',
        // การ์ดทั่วไป (shadow-sm) นุ่มและกระจายกว่าเดิม แทนขอบเข้ม
        sm: '0 1px 2px rgb(60 45 20 / 0.06), 0 6px 16px -8px rgb(60 45 20 / 0.18)',
      },
      keyframes: {
        bob: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(28px) scale(.9)' },
          '60%': { opacity: '1', transform: 'translateY(-5px) scale(1.02)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'check-pop': {
          '0%': { transform: 'scale(0) rotate(-35deg)' },
          '60%': { transform: 'scale(1.3) rotate(8deg)' },
          '100%': { transform: 'scale(1) rotate(0)' },
        },
        'ring-out': {
          '0%': { transform: 'scale(.7)', opacity: '.65' },
          '100%': { transform: 'scale(2.1)', opacity: '0' },
        },
        'toast-timer': { from: { transform: 'scaleX(1)' }, to: { transform: 'scaleX(0)' } },
      },
      animation: {
        bob: 'bob 2.4s ease-in-out infinite',
        pop: 'pop .28s ease-out both',
        'toast-in': 'toast-in .5s cubic-bezier(.2,.9,.3,1.2) both',
        'check-pop': 'check-pop .5s .12s cubic-bezier(.2,.9,.3,1.3) both',
        'ring-out': 'ring-out .8s .12s ease-out both',
      },
    },
  },
};
