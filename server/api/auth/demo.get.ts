// Whether this site offers a demo login, so the login page can say so.
import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'nuxt/server'
import { users } from '../../db/schema.ts'
import { getDb } from '../../utils/app.ts'
import { DEMO_PASSWORD, DEMO_USERNAME, demoModeOn } from '../../utils/demo.ts'

export default defineEventHandler(() => {
  // No demo login if the owner's own account has that name.
  const taken = getDb().select().from(users).where(eq(users.username, DEMO_USERNAME)).get() !== undefined
  return demoModeOn() && !taken ? { enabled: true, username: DEMO_USERNAME, password: DEMO_PASSWORD } : { enabled: false }
})
