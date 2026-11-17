// With the admin at an address of its own, the admin's pages and the public
// pages live at different addresses. The server already sends a request for
// the wrong half to the right address; this does the same for a move made
// inside the browser, which never asks the server.
import type { HostHalves } from '~/plugins/hosts'

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  const halves = useState<HostHalves | null>('fb-hosts').value
  if (!halves) return
  const forAdmin = /^\/(admin|login|setup)(\/|$)/i.test(to.path)
  if (forAdmin && halves.here === 'site') return navigateTo(halves.admin + to.fullPath, { external: true })
  if (!forAdmin && halves.here === 'admin') return navigateTo(to.path === '/' ? `${halves.admin}/admin` : halves.site + to.fullPath, { external: true })
})
