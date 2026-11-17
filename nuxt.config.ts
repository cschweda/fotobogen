import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  modules: ['@nuxt/ui', 'nuxt-security'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },

  // The top-level modules/ folder holds Fotobogen's photo modules (DESIGN.md
  // section 10), not Nuxt build modules, so Nuxt is told to look elsewhere.
  dir: { modules: 'nuxt-modules' },

  app: {
    head: {
      htmlAttrs: { lang: 'en', class: 'dark' },
      meta: [
        { name: 'color-scheme', content: 'dark' },
        { name: 'theme-color', content: '#0a0a0b' },
      ],
      // The icon is set by the page: the admin's own mark there (FbShell), the owner's on the public site.
    },
  },

  runtimeConfig: {
    appVersion: pkg.version,
  },

  nitro: {
    preset: 'node-server',
    // Migration SQL is bundled into the server build, so a deployed app
    // needs nothing on disk except its data directory.
    serverAssets: [
      { baseName: 'migrations', dir: fileURLToPath(new URL('./server/db/migrations', import.meta.url)) },
      // The skins that ship with Fotobogen.
      { baseName: 'skins', dir: fileURLToPath(new URL('./skins', import.meta.url)) },
    ],
  },

  // No third-party origins at run time: system fonts, icons bundled locally.
  // (The one exception is the owner's choice: a counting service switched on under
  // Admin, Visitor statistics, which server/plugins/10.stats.ts lets in page by page.)
  // The whole product is dark (DESIGN.md section 11), so color mode is fixed.
  ui: { fonts: false, colorMode: false },
  icon: {
    provider: 'none',
    serverBundle: { collections: ['lucide'] },
    clientBundle: { scan: true },
  },

  // The admin, the login, and setup are never shown inside a frame, not even one of the site's own
  // pages: a script on a public page must not be able to open the admin in a hidden frame and read it.
  routeRules: {
    ...Object.fromEntries(['/admin', '/admin/**', '/login', '/setup', '/setup/**'].map(route =>
      [route, { security: { headers: { xFrameOptions: 'DENY' as const, contentSecurityPolicy: { 'frame-ancestors': ['\'none\''] } } } }])),
    // The one page made to be shown inside other sites' pages: the slideshow under /embed. It exists only
    // when the owner has switched it on (server/middleware/05.embed.ts); every other page keeps refusing.
    '/embed/**': { security: { headers: { xFrameOptions: false as const, contentSecurityPolicy: { 'frame-ancestors': ['*'] } } } },
  },

  // nuxt-security is used for response headers and CSP only (DESIGN.md section 6).
  security: {
    rateLimiter: false,
    requestSizeLimiter: false,
    xssValidator: false,
    removeLoggers: false,
    headers: {
      // TLS is terminated by the proxy, which also sets HSTS.
      strictTransportSecurity: false,
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'script-src': ["'self'", "'strict-dynamic'", "'nonce-{{nonce}}'"],
        'upgrade-insecure-requests': false,
      },
    },
  },
})
