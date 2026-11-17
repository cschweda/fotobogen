// The first half of switching two-step login on: shows the server's key, to
// be added to an authenticator app. Nothing changes until a code from the app
// is given to enable.post.ts.
import { defineEventHandler, readBody } from 'nuxt/server'
import { fail } from '../../../utils/respond.ts'
import { keyDetails, passwordRefusal, requireOwner, serverKey } from '../../../utils/two-step.ts'

export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  const body = await readBody(event).catch(() => null) as { password?: unknown } | null
  const refusal = await passwordRefusal(event, user, body?.password)
  if (refusal) return refusal
  if (user.totpSecret) return fail(event, 409, 'Two-step login is already on.')
  const server = serverKey()
  // `known`: some phone already holds this key, from another Fotobogen on this server. No new entry is needed.
  return { ...keyDetails(server.key), known: server.confirmed }
})
