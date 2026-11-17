// Delete a page. Its words are gone for good; pages have no trash.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { deletePage } from '../../../../utils/pages.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  if (admin.token) return fail(event, 403, 'An API token cannot change the site\'s pages. Log in to the admin to do that.')
  if (!deletePage(getRouterParam(event, 'id') ?? '')) return fail(event, 404, 'There is no such page.')
  return { deleted: 1 }
})
