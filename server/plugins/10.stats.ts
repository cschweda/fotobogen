// Visitor statistics. When the owner has chosen a counting service, its
// script tag is added to public pages here, as each page is made, and the
// page is allowed to report to that one service and nowhere else.
//
// Never on the admin, the login, or setup; and never on a page made for
// someone who is logged in, so the owner's own visits are not counted and the
// script is not handed to a browser that holds the owner's login.
//
// What this does not do, and cannot: fence the script off from the admin. It
// runs on this site's own address, with the standing of the site's own pages.
// A public page opened before logging in keeps its script afterwards, and a
// hostile service could use that page to act as the owner. That is the trust
// the owner places in the service they choose, and the admin and docs say so.
import { statsHtml } from '../../shared/stats.ts'
import { isSetupComplete } from '../utils/app.ts'
import { currentAdmin } from '../utils/session.ts'
import { statsForPath } from '../utils/stats.ts'

type Policy = Record<string, string[] | string | boolean | undefined>

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', async (html, { event }) => {
    try {
      if (!isSetupComplete()) return
      const tags = statsForPath(event.path)
      if (!tags) return
      // The page's own rules and its one-time number for scripts. Without both, nothing is added.
      const security = (event.context as { security?: { nonce?: string, rules?: { headers?: { contentSecurityPolicy?: Policy | false } } } }).security
      const policy = security?.rules?.headers?.contentSecurityPolicy
      if (!security?.nonce || !policy || typeof policy !== 'object') return
      if (await currentAdmin(event as never)) return

      const list = (name: string, fallback: string[]): string[] => {
        const now = policy[name]
        return Array.isArray(now) ? now : typeof now === 'string' ? now.split(' ').filter(Boolean) : fallback
      }
      // Where the script may send what it counts. (The script itself is let in by the nonce.)
      policy['connect-src'] = [...list('connect-src', ['\'self\'']), ...tags.allow]
      policy['img-src'] = [...list('img-src', ['\'self\'']), ...tags.allow]
      // Added without a nonce; the step that follows gives every script tag in the page this page's nonce.
      html.head.push(statsHtml(tags))
    }
    catch {
      // A problem here must never stop a page from being shown; the page simply goes uncounted.
    }
  })
})
