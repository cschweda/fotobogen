// Switch a module on or off. Photos keep their recipes; the steps of a
// module that is off are skipped until it is switched on again.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { getPipeline } from '../../../utils/app.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ enabled?: unknown }>(event).catch(() => null)
  if (typeof body?.enabled !== 'boolean') return fail(event, 422, 'Send { "enabled": true } or { "enabled": false }.')
  if (!getPipeline().modules!.setEnabled(getRouterParam(event, 'name') ?? '', body.enabled)) {
    return fail(event, 404, 'There is no such module, or it failed to load.')
  }
  return { ok: true }
})
