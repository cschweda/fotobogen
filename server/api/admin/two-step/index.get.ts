// Whether two-step login is on. Shows no key and no codes: those need the password again.
import { defineEventHandler } from 'nuxt/server'
import { entryName, requireOwner } from '../../../utils/two-step.ts'

export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  const codes = user.backupCodes ?? []
  return {
    enabled: Boolean(user.totpSecret),
    name: `Fotobogen (${entryName()})`,
    codesLeft: codes.filter(entry => entry.usedAt === null).length,
    codesTotal: codes.length,
  }
})
