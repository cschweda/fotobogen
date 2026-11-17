// Demo mode: a login anyone may use (demo / demo) to look round the admin of
// a site meant to show Fotobogen off. It is switched on by the server
// (DEMO_MODE=1), never from the admin.
//
// A demo visitor may read and may not write. What they may read is listed
// here, by name; a request not on the list is refused. So a new admin
// endpoint is closed to demo visitors until someone decides otherwise.
import { resolveSettings } from '../core/config.ts'

export const DEMO_USERNAME = 'demo'
export const DEMO_PASSWORD = 'demo'
export const demoModeOn = (): boolean => resolveSettings(process.env).demoMode

export const DEMO_REFUSAL = 'This is a demo: you can look at everything, but nothing can be changed.'
export const DEMO_HIDDEN = 'This part of the admin is not shown in the demo.'

const ID = '[A-Za-z0-9_-]+'
// Pages of settings and lists, each read whole.
const READABLE = /^\/api\/admin\/(overview|system|settings|site-text|seo|stats|brand|skins|modules|albums|samples|updates|photos)$/
const READABLE_ONE = new RegExp(`^/api/admin/(photos|albums)/${ID}$`)
// Trying a look on a photo: it draws a preview and saves nothing.
const PREVIEW = new RegExp(`^/api/admin/photos/${ID}/preview$`)

/**
 * What a demo visitor may ask of the admin's API.
 * Not on the list, and so refused: anything that changes the site; the
 * backup (it holds the owner's login and every original file); restore;
 * API tokens; webhooks.
 */
export function demoAllows(method: string, path: string): 'yes' | 'changes' | 'hidden' {
  const verb = method.toUpperCase()
  if (verb === 'GET' || verb === 'HEAD') return READABLE.test(path) || READABLE_ONE.test(path) ? 'yes' : 'hidden'
  if (verb === 'POST' && PREVIEW.test(path)) return 'yes'
  return 'changes'
}
