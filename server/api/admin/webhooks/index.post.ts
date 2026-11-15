// Add a webhook: { "url": "https://…", "events": ["photo.published", …] }.
// The answer includes its secret, this once.
import { defineEventHandler, readBody, setResponseStatus } from 'nuxt/server'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { addWebhook } from '../../../utils/webhooks.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ url?: unknown, events?: unknown }>(event).catch(() => null)
  const result = await addWebhook(body?.url, body?.events)
  if (!result.ok) return fail(event, 422, 'The webhook could not be added.', { errors: result.errors })
  setResponseStatus(event, 201)
  return result.webhook
})
