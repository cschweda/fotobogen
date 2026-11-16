// The first look at every request, before anything else judges it.
import { defineEventHandler, getRequestHeader, getRequestURL } from 'nuxt/server'
import { isPlainGuardedPath, isValidHost } from '../core/request.ts'

const refuse = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export default defineEventHandler((event) => {
  let pathname: string
  try {
    // A method no website needs (TRACE, CONNECT) or a Host that is not a name cannot even be read as a request.
    void event.req.method
    pathname = getRequestURL(event).pathname
  }
  catch {
    return refuse(400, 'That request cannot be read.')
  }
  // The feed, the sitemap, and links written out in full use this name.
  const host = getRequestHeader(event, 'host')
  if (host !== undefined && !isValidHost(host)) return refuse(400, 'The Host header is not a valid site name.')
  if (!isPlainGuardedPath(pathname)) return refuse(400, 'Write this address plainly, without percent-encoding.')
})
