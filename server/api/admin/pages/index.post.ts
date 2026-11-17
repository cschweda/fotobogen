// Create a page: { "title": "...", "body": "...", "slug"?, "visibility"?, "inMenu"? }.
// What a page says is shown to every visitor under the site's name, so it is
// for the logged-in owner alone: no API token reaches it.
import { defineEventHandler, readBody, setResponseStatus } from 'nuxt/server'
import { createPage } from '../../../utils/pages.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  if (admin.token) return fail(event, 403, 'An API token cannot change the site\'s pages. Log in to the admin to do that.')
  const result = createPage(await readBody<Record<string, unknown>>(event).catch(() => null) ?? {})
  if (!result.ok) return fail(event, 422, 'The page could not be created.', { errors: result.errors })
  setResponseStatus(event, 201)
  return result
})
