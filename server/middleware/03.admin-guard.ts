// The real guard for the admin area. It runs on the server for every
// /admin page and every /api/admin/* request, whether or not a route
// exists there; the client-side route guard is only a convenience.
import { defineEventHandler, getRequestURL, sendRedirect } from 'nuxt/server'
import { isSetupComplete } from '../utils/app.ts'
import { currentAdmin, requireAdmin } from '../utils/session.ts'

export default defineEventHandler(async (event) => {
  if (!isSetupComplete()) return
  // Lowercased because the page router matches paths without regard to case.
  const path = getRequestURL(event).pathname.toLowerCase()

  if (path.startsWith('/api/admin/')) {
    await requireAdmin(event)
    return
  }
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!(await currentAdmin(event))) return sendRedirect(event, '/login', 302)
    return
  }
  if (path === '/login' && await currentAdmin(event)) {
    return sendRedirect(event, '/admin', 302)
  }
})
