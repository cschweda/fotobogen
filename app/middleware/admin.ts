// A convenience for navigation inside the browser. The real guard is on the
// server (server/middleware/03.admin-guard.ts) and does not depend on this.
export default defineNuxtRouteMiddleware(async () => {
  const { user } = await useRequestFetch()<{ user: { username: string } | null }>('/api/auth/me')
  if (!user) return navigateTo('/login')
})
