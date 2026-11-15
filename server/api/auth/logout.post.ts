import { eq, sql } from 'drizzle-orm'
import { defineEventHandler } from 'nuxt/server'
import { users } from '../../db/schema.ts'
import { getDb } from '../../utils/app.ts'
import { currentAdmin, signOut } from '../../utils/session.ts'

export default defineEventHandler(async (event) => {
  // A sealed cookie cannot be recalled, so clearing it in this browser is
  // not enough: a copy of it would keep working. Bumping session_version
  // ends every session for this user, on every device.
  const admin = await currentAdmin(event)
  if (admin) {
    getDb().update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, admin.id)).run()
  }
  await signOut(event)
  return { ok: true }
})
