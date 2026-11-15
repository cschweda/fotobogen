// Queue a failed photo for another try.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { getQueue } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  if (!getQueue().retry(getRouterParam(event, 'id') ?? '')) {
    return fail(event, 409, 'Only a photo that failed to process can be retried.')
  }
  return { ok: true }
})
