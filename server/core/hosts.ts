// The admin at an address of its own.
//
// Normally the admin lives at the site's own address, under /admin. With
// ADMIN_HOST set (admin.photos.example.com, say), the admin, the login,
// setup, and their API answer only at that name, and the public pages only
// at the site's. A browser treats the two names as different places: the
// login is kept for the admin's name and never sent to the public one, so
// nothing running on a public page (a counting script, for one) can reach
// the admin. Plain TypeScript with nothing from the web framework.
import { isValidHost } from './request.ts'

export interface Hosts {
  /** The admin's name, with a port if it has one: admin.photos.example.com */
  adminHost: string
  /** The public site's address: https://photos.example.com */
  siteUrl: string
}

/** What is wrong with these two settings together, or null. An empty adminHost is "not used". */
export function adminHostProblem(adminHost: string, siteUrl: string): string | null {
  if (adminHost === '') return null
  if (!isValidHost(adminHost)) return `ADMIN_HOST is "${adminHost}". Give the admin's name only, such as admin.photos.example.com, with no https:// and no path.`
  if (siteUrl === '') return 'ADMIN_HOST is set, so SITE_URL must be set too: the address of the public site, such as https://photos.example.com.'
  if (new URL(siteUrl).host.toLowerCase() === adminHost.toLowerCase()) return 'ADMIN_HOST and SITE_URL name the same place. The admin needs a different name from the public site, such as admin.photos.example.com.'
  return null
}

/** The admin's address in full: the site's scheme, the admin's name. */
export function adminOrigin(hosts: Hosts): string {
  return `${new URL(hosts.siteUrl).protocol}//${hosts.adminHost}`
}

export type Ruling = { do: 'serve' } | { do: 'redirect', to: string } | { do: 'refuse', message: string }

const ADMIN_PAGE = /^\/(admin|login|setup)(\/|$)/
const ADMIN_API = /^\/api\/(admin|auth|setup)(\/|$)/
// What both addresses serve: pictures, built files, the public API, the health check.
const SHARED = /^\/(api|media|brand|_nuxt|__nuxt[^/]*|favicon\.ico|skin\.css)(\/|$)/

/** What to do with a request, given the name it was sent to. `path` may carry a query string. */
export function rulingFor(hosts: Hosts, request: { host: string | undefined, method: string, path: string }): Ruling {
  const atAdmin = (request.host ?? '').toLowerCase() === hosts.adminHost.toLowerCase()
  const pathname = (request.path.split('?')[0] ?? '').toLowerCase()
  const reading = request.method === 'GET' || request.method === 'HEAD'
  const admin = adminOrigin(hosts)

  if (ADMIN_API.test(pathname)) return atAdmin ? { do: 'serve' } : { do: 'refuse', message: `The admin of this site is at ${admin}.` }
  if (ADMIN_PAGE.test(pathname)) {
    if (atAdmin) return { do: 'serve' }
    return reading ? { do: 'redirect', to: admin + request.path } : { do: 'refuse', message: `The admin of this site is at ${admin}.` }
  }
  if (SHARED.test(pathname) || !atAdmin) return { do: 'serve' }
  // A public page asked for at the admin's address.
  if (!reading) return { do: 'refuse', message: `The public site is at ${hosts.siteUrl}.` }
  return { do: 'redirect', to: pathname === '/' ? `${admin}/admin` : hosts.siteUrl + request.path }
}
