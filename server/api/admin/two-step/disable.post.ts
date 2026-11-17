// Switches two-step login off: the password alone logs in again, and the backup codes are thrown away.
import { defineEventHandler, readBody } from 'nuxt/server'
import { disableTwoStep, passwordRefusal, requireOwner } from '../../../utils/two-step.ts'

export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  const body = await readBody(event).catch(() => null) as { password?: unknown } | null
  const refusal = await passwordRefusal(event, user, body?.password)
  if (refusal) return refusal
  disableTwoStep(user)
  return { ok: true }
})
