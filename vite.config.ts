import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Nudge — gentle habit tracker', short_name: 'Nudge',
      description: 'Small steps, softer days.', theme_color: '#f8f7f4',
      background_color: '#f8f7f4', display: 'standalone', start_url: '/today',
      icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
    },
  })],
})
