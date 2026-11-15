// The site's webhooks, with how each one's last delivery went. Secrets are
// shown once, when a webhook is created, and never again.
import { defineEventHandler } from 'nuxt/server'
import { requireAdmin } from '../../../utils/session.ts'
import { EVENTS, lastDelivery, listWebhooks } from '../../../utils/webhooks.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return {
    events: EVENTS,
    webhooks: listWebhooks().map(({ secret: _secret, ...hook }) => ({ ...hook, last: lastDelivery(hook.id) })),
  }
})
