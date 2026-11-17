// Change a page: any of title, body, slug, visibility, inMenu.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { updatePage } from '../../../../utils/pages.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  if (admin.token) return fail(event, 403, 'An API token cannot change the site\'s pages. Log in to the admin to do that.')
  const result = updatePage(getRouterParam(event, 'id') ?? '', await readBody<Record<string, unknown>>(event).catch(() => null) ?? {})
  if (result.ok) return result
  if (result.reason === 'not-found') return fail(event, 404, 'There is no such page.')
  return fail(event, result.reason === 'slug-taken' ? 409 : 422, 'The page could not be saved.', { errors: result.errors })
})
