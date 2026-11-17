// Move a page one place up or down the menu: { "to": "up" | "down" }.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { movePage } from '../../../../utils/pages.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  if (admin.token) return fail(event, 403, 'An API token cannot change the site\'s pages. Log in to the admin to do that.')
  const body = await readBody<{ to?: unknown }>(event).catch(() => null)
  if (body?.to !== 'up' && body?.to !== 'down') return fail(event, 422, 'Say which way: up or down.')
  if (!movePage(getRouterParam(event, 'id') ?? '', body.to)) return fail(event, 404, 'There is no such page.')
  return { ok: true }
})
