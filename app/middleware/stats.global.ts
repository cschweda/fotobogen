// Visitor statistics. A counting script, once loaded on a public page, stays
// in the browser as the visitor moves from page to page. It must not come
// along into the login or the admin, so going there from a page that has it
// loads the page afresh from the server, which never puts the script on those.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  if (/^\/(admin|login|setup)(\/|$)/i.test(to.path) && document.querySelector('script[data-fb-stats]')) {
    return navigateTo(to.fullPath, { external: true })
  }
})
