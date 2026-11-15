// Switch a module on or off. Photos keep their recipes; the steps of a
// module that is off are skipped until it is switched on again. Every
// module starts switched off.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { rerenderForModule } from '../../../pipeline/render.ts'
import { getPipeline, getQueue } from '../../../utils/app.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ enabled?: unknown }>(event).catch(() => null)
  if (typeof body?.enabled !== 'boolean') return fail(event, 422, 'Send { "enabled": true } or { "enabled": false }.')
  const name = getRouterParam(event, 'name') ?? ''
  if (!getPipeline().modules!.setEnabled(name, body.enabled)) {
    return fail(event, 404, 'There is no such module, or it failed to load.')
  }
  // Photos that use the module are rendered again, with or without it.
  const queued = rerenderForModule(getPipeline(), name)
  getQueue().kick()
  return { ok: true, queued }
})
