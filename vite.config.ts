import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    // Custom service worker (src/sw.ts) so we can handle push notifications.
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.ts',
    injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] },
    includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'badge-96.png'],
    // Service worker in `npm run dev` too, so notifications can be tried locally.
    devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    manifest: {
      name: 'Nudge — productivity OS', short_name: 'Nudge',
      description: 'Plan, track, reflect, improve.', theme_color: '#f7f5f4',
      background_color: '#f7f5f4', display: 'standalone', start_url: '/today',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
  })],
})
