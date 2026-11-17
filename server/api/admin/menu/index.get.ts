// The links the owner added to the site's menu.
import { defineEventHandler } from 'nuxt/server'
import { MAX_MENU_LINKS, MENU_LABEL_MAX } from '../../../../shared/page-text.ts'
import { menuLinks } from '../../../utils/pages.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  if (admin.token) return fail(event, 403, 'An API token cannot reach the site\'s menu. Log in to the admin to do that.')
  return { links: menuLinks(), limits: { links: MAX_MENU_LINKS, label: MENU_LABEL_MAX } }
})
