import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-update the cached app shell when a new build ships.
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Stockroom',
        short_name: 'Stockroom',
        description: 'Inventory app for the lighting/stockroom team. Add items, scan in/out, see low-stock alerts.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Precache everything Vite emits so the app shell works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Don't precache the Supabase API; let it hit the network each time
        // and fail loudly when offline (an explicit offline queue is a
        // separate feature — see BRIEF.md section 8.3).
        navigateFallbackDenylist: [/^\/_/, /^\/rest\//, /^\/auth\//],
      },
    }),
  ],
  server: {
    host: true,   // expose on LAN so phones can hit the dev server
    port: 5173,
  },
});
