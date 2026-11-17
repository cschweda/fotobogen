// The first look at every request, before anything else judges it.
import { defineEventHandler, getRequestHeader, getRequestURL, sendRedirect } from 'nuxt/server'
import { resolveSettings } from '../core/config.ts'
import { adminOrigin, rulingFor } from '../core/hosts.ts'
import { isPlainGuardedPath, isValidHost } from '../core/request.ts'

const refuse = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export default defineEventHandler((event) => {
  let pathname: string
  let search: string
  try {
    // A method no website needs (TRACE, CONNECT) or a Host that is not a name cannot even be read as a request.
    void event.req.method
    const url = getRequestURL(event)
    pathname = url.pathname
    search = url.search
  }
  catch {
    return refuse(400, 'That request cannot be read.')
  }
  // The feed, the sitemap, and links written out in full use this name.
  const host = getRequestHeader(event, 'host')
  if (host !== undefined && !isValidHost(host)) return refuse(400, 'The Host header is not a valid site name.')
  if (!isPlainGuardedPath(pathname)) return refuse(400, 'Write this address plainly, without percent-encoding.')

  // The admin at an address of its own (ADMIN_HOST): each address serves only its own half.
  const { adminHost, siteUrl } = resolveSettings(process.env)
  if (adminHost && siteUrl) {
    const hosts = { adminHost, siteUrl }
    const ruling = rulingFor(hosts, { host, method: event.req.method, path: pathname + search })
    if (ruling.do === 'refuse') return refuse(404, ruling.message)
    if (ruling.do === 'redirect') return sendRedirect(event, ruling.to, 302)
    // For the pages: which half this is, and where the other one lives.
    event.context.fbHosts = { here: (host ?? '').toLowerCase() === adminHost ? 'admin' : 'site', admin: adminOrigin(hosts), site: siteUrl }
  }
})
