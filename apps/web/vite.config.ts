import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // แยก vendor ออกเป็นไฟล์แคชได้นานและโหลดคู่ขนาน (FullCalendar โหลดเฉพาะหลัง login)
        manualChunks(id) {
          if (id.includes('node_modules/@fullcalendar')) return 'fullcalendar';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
      '/webhook': 'http://localhost:8787',
    },
  },
});
