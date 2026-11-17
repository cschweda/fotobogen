// Two things about which pages belong where.
//
// 1. With the admin at an address of its own (ADMIN_HOST), the server tells
//    each page which half it is and where the other half lives; the route
//    middleware (middleware/hosts.global.ts) uses that.
// 2. When someone logs in, pages of the site open in other tabs that carry a
//    counting script load themselves again. Loaded for someone logged in,
//    they come without it. This covers the ordinary case of a tab left open;
//    it is not a guarantee against a script written to get round it.
export interface HostHalves { here: 'admin' | 'site', admin: string, site: string }

export default defineNuxtPlugin(() => {
  const halves = useState<HostHalves | null>('fb-hosts', () => null)
  if (import.meta.server) halves.value = (useRequestEvent()?.context.fbHosts as HostHalves | undefined) ?? null
  // Where "View your site" leads from the admin: the public site's front page, wherever that is.
  const provide = { siteHome: halves.value?.here === 'admin' ? `${halves.value.site}/` : '/' }
  if (import.meta.server) return { provide }
  try {
    new BroadcastChannel('fotobogen').addEventListener('message', (message) => {
      if (message.data === 'signed-in' && document.querySelector('script[data-fb-stats]')) window.location.reload()
    })
  }
  catch { /* a browser without it; nothing depends on this */ }
  return { provide }
})
