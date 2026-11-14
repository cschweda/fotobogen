// Until setup is complete, the only things reachable are the wizard, its
// API, the health check, and built assets. Afterwards the wizard and its API
// are gone for good (DESIGN.md section 5).
import { createError, defineEventHandler, sendRedirect } from 'nuxt/server'
import { isSetupComplete } from '../utils/app.ts'
import { fail } from '../utils/respond.ts'

const isSetupPath = (path: string) =>
  path === '/setup' || path.startsWith('/setup/') || path.startsWith('/api/setup/')

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]!

  if (isSetupComplete()) {
    if (isSetupPath(path)) throw createError({ status: 404, message: 'Page not found' })
    return
  }

  // Built assets and framework internals (/_nuxt/..., /__nuxt_error, /api/_...).
  if (isSetupPath(path) || path === '/api/health' || path.startsWith('/_') || path.startsWith('/api/_')) return

  if (path.startsWith('/api/') || !['GET', 'HEAD'].includes(event.method)) {
    return fail(event, 503, 'Fotobogen has not been set up yet.')
  }
  return sendRedirect(event, '/setup', 302)
})
