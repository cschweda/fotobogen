// The admin's list of pages, in the order of the menu.
import { defineEventHandler } from 'nuxt/server'
import { MAX_PAGES, PAGE_BODY_MAX, PAGE_TITLE_MAX } from '../../../../shared/page-text.ts'
import { listPages } from '../../../utils/pages.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  if (admin.token) return fail(event, 403, 'An API token cannot reach the site\'s pages. Log in to the admin to do that.')
  return { pages: listPages(), limits: { pages: MAX_PAGES, title: PAGE_TITLE_MAX, body: PAGE_BODY_MAX } }
})
