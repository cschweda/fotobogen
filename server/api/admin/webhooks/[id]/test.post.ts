// Send a test message to a webhook now, and say how it went.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'
import { sendTest } from '../../../../utils/webhooks.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const delivery = await sendTest(getRouterParam(event, 'id') ?? '')
  if (!delivery) return fail(event, 404, 'There is no such webhook.')
  return delivery
})
