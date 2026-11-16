// The real guard for the admin area. It runs on the server for every
// /admin page and every /api/admin/* request, whether or not a route
// exists there; the client-side route guard is only a convenience.
import { defineEventHandler, getRequestURL, sendRedirect } from 'nuxt/server'
import { isSetupComplete } from '../utils/app.ts'
import { DEMO_HIDDEN, DEMO_REFUSAL, demoAllows } from '../utils/demo.ts'
import { fail } from '../utils/respond.ts'
import { currentAdmin, requireAdmin } from '../utils/session.ts'

export default defineEventHandler(async (event) => {
  if (!isSetupComplete()) return
  // Lowercased because the page router matches paths without regard to case.
  const path = getRequestURL(event).pathname.toLowerCase()
  // What the admin and the login answer is for one person, now: never kept by a browser or a proxy.
  if (path.startsWith('/api/admin/') || path.startsWith('/api/auth/') || path === '/admin' || path.startsWith('/admin/')) {
    event.res.headers.set('cache-control', 'no-store')
  }

  if (path.startsWith('/api/admin/')) {
    const admin = await requireAdmin(event)
    // A demo visitor may read what is listed for them, and change nothing.
    if (admin.demo) {
      const allowed = demoAllows(event.req.method, getRequestURL(event).pathname)
      if (allowed !== 'yes') return fail(event, 403, allowed === 'changes' ? DEMO_REFUSAL : DEMO_HIDDEN)
    }
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
