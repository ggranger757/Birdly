import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' so the build works at https://<user>.github.io/<any-repo-name>/
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'favicon.png'],
      manifest: {
        name: 'PIXEL BIRDER',
        short_name: 'Pixel Birder',
        description: 'Every bird you see becomes a sprite.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0A0C0F',
        theme_color: '#0A0C0F',
        categories: ['games', 'education', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // iNaturalist reference photos (opaque cross-origin images → status 0)
            urlPattern: /^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\//,
            handler: 'CacheFirst',
            options: { cacheName: 'ref-photos', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 300, maxAgeSeconds: 60 * 864e2 } }
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'weather', networkTimeoutSeconds: 4, expiration: { maxEntries: 20, maxAgeSeconds: 86400 } }
          }
        ]
      }
    })
  ],
  worker: { format: 'es' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
} as any);
