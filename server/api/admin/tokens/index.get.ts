// The API tokens that exist. The tokens themselves are never shown again; only their first characters.
import { defineEventHandler } from 'nuxt/server'
import { requireAdmin } from '../../../utils/session.ts'
import { listTokens, MAX_TOKENS, SCOPE_ABOUT } from '../../../utils/tokens.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { tokens: listTokens(), scopes: SCOPE_ABOUT, max: MAX_TOKENS }
})
