// A convenience for navigation inside the browser. The real guard is on the
// server (server/middleware/03.admin-guard.ts) and does not depend on this.
//
// It also holds a new owner at the notice about backups until they have
// pressed "I understand".
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, acknowledged } = await useRequestFetch()<{ user: { username: string } | null, acknowledged?: boolean }>('/api/auth/me')
  if (!user) return navigateTo('/login')
  if (!acknowledged && to.path !== '/admin/welcome') return navigateTo('/admin/welcome')
  if (acknowledged && to.path === '/admin/welcome') return navigateTo('/admin')
})
