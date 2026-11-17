// The slideshow made for other sites is the one page that may be shown in a
// frame there. A move from it to any other page is made by asking the server
// for that page afresh, never inside the browser: the server's answer carries
// that page's own refusal to be framed, which a move inside the browser
// would skip.
export default defineNuxtRouteMiddleware((to, from) => {
  if (import.meta.server) return
  const embedded = (path: string) => /^\/embed(\/|$)/i.test(path)
  if (embedded(from.path) && !embedded(to.path)) return navigateTo(to.fullPath, { external: true })
})
