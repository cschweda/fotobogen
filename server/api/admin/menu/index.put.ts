// Save the links the owner adds to the site's menu: { "links": [{ "label", "url" }] }.
// Every visitor sees these under the site's name, so they are for the
// logged-in owner alone, and each address is checked: a web address, an
// email address, or a page of this site.
import { defineEventHandler, readBody } from 'nuxt/server'
import { cleanMenuLinks } from '../../../../shared/page-text.ts'
import { MENU_KEY } from '../../../utils/pages.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { setSettings } from '../../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  if (admin.token) return fail(event, 403, 'An API token cannot change the site\'s menu. Log in to the admin to do that.')
  const body = await readBody<{ links?: unknown }>(event).catch(() => null)
  const { links, errors } = cleanMenuLinks(body?.links)
  if (Object.keys(errors).length > 0) return fail(event, 422, 'Some of these links need another look.', { errors })
  setSettings({ [MENU_KEY]: links })
  return { ok: true, links }
})
