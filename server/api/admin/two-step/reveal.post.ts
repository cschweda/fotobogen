// Shows the key and the backup codes again, for adding a new phone or
// downloading the codes a second time. The password is asked for first.
import { defineEventHandler, readBody } from 'nuxt/server'
import { fail } from '../../../utils/respond.ts'
import { keyDetails, passwordRefusal, requireOwner } from '../../../utils/two-step.ts'

export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  const body = await readBody(event).catch(() => null) as { password?: unknown } | null
  const refusal = await passwordRefusal(event, user, body?.password)
  if (refusal) return refusal
  if (!user.totpSecret) return fail(event, 409, 'Two-step login is off.')
  return { ...keyDetails(user.totpSecret), codes: (user.backupCodes ?? []).map(entry => ({ code: entry.code, used: entry.usedAt !== null })) }
})
