import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * OJO: GitHub Pages sirve el sitio bajo /<nombre-del-repo>/, no en la raíz.
 * Si el repo se renombra hay que cambiar esto o la app cargará en blanco con
 * un puñado de 404. Es el fallo típico.
 *
 * Todo lo que dependa de esta ruta (assets, scope del service worker,
 * navigateFallback, start_url del manifest, fetch del dataset) sale de aquí o
 * de `import.meta.env.BASE_URL`. No la escribas a mano en ningún otro sitio.
 */
const BASE = '/recetas-app/';

export default defineConfig({
  base: BASE,
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // El plugin usa esto para el scope y para las rutas del precache.
      base: BASE,
      scope: BASE,
      includeAssets: ['icons/*.png', '.nojekyll'],
      manifest: {
        id: BASE,
        name: 'Recetas y productos de Mercadona',
        short_name: 'Recetas',
        description:
          'Catálogo de Mercadona con fotos, formatos y precios, y mis recetas. Funciona sin cobertura.',
        lang: 'es',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#12211c',
        theme_color: '#12211c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // El dataset son ~2 MB y acaba en IndexedDB. Precachearlo lo guardaría
        // dos veces: se descarga a mano en el primer arranque.
        globIgnores: ['**/data/dataset.json'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // El CDN manda Access-Control-Allow-Origin: * y las URLs llevan el
            // hash del contenido con max-age de un año: se pueden cachear a
            // ciegas y sobreviven a que se recree la BD del catálogo.
            urlPattern: /^https:\/\/prod-mercadona\.imgix\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos-mercadona',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
