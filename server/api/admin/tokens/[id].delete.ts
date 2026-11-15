// Revoke an API token. Anything using it stops working at once.
import { defineEventHandler, getRouterParam } from 'nuxt/server'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { revokeToken } from '../../../utils/tokens.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  if (!revokeToken(getRouterParam(event, 'id') ?? '')) return fail(event, 404, 'There is no such token.')
  return { ok: true }
})
