import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // expose on LAN so phones can hit the dev server
    port: 5173,
  },
});
