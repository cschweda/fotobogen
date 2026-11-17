// Makes ten new backup codes. The old ones stop working.
import { defineEventHandler, readBody } from 'nuxt/server'
import { fail } from '../../../utils/respond.ts'
import { passwordRefusal, replaceBackupCodes, requireOwner } from '../../../utils/two-step.ts'

export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  const body = await readBody(event).catch(() => null) as { password?: unknown } | null
  const refusal = await passwordRefusal(event, user, body?.password)
  if (refusal) return refusal
  if (!user.totpSecret) return fail(event, 409, 'Two-step login is off.')
  return { ok: true, codes: replaceBackupCodes(user).map(code => ({ code, used: false })) }
})
