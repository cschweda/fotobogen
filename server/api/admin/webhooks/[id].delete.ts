// Remove a webhook.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { removeWebhook } from '../../../utils/webhooks.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  if (!removeWebhook(getRouterParam(event, 'id') ?? '')) return fail(event, 404, 'There is no such webhook.')
  return { ok: true }
})
