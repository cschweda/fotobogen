// Change a photo's words, address, date, or visibility. Only the fields sent are changed.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { updatePhoto } from '../../../../pipeline/library.ts'
import { getPipeline } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object') return fail(event, 422, 'Send the fields to change as JSON.')
  const result = updatePhoto(getPipeline(), getRouterParam(event, 'id') ?? '', body)
  if (result.ok) return result
  if (result.reason === 'not-found') return fail(event, 404, 'There is no such photo.')
  return fail(event, result.reason === 'slug-taken' ? 409 : 422, 'Some fields need another look.', { errors: result.errors })
})
