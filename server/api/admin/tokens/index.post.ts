// Make an API token. The answer carries the token itself, this once.
import { defineEventHandler, readBody } from 'nuxt/server'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { createToken, listTokens, MAX_TOKENS, TOKEN_NAME_MAX, TOKEN_SCOPES, type TokenScope } from '../../../utils/tokens.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ name?: unknown, scope?: unknown }>(event).catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, TOKEN_NAME_MAX) : ''
  const errors: Record<string, string> = {}
  if (!name) errors.name = 'Give the token a name that says what it is for, such as "Lightroom on my laptop".'
  if (!TOKEN_SCOPES.includes(body?.scope as TokenScope)) errors.scope = 'Choose what the token may do.'
  if (Object.keys(errors).length > 0) return fail(event, 422, 'The token needs a name and a kind.', { errors })
  if (listTokens().length >= MAX_TOKENS) return fail(event, 422, `There are already ${MAX_TOKENS} tokens. Revoke one you no longer use first.`)
  return createToken(name, body!.scope as TokenScope)
})
