// Who is logged in, for the pages. Never an error: `user` is null when nobody is.
import { defineEventHandler } from 'nuxt/server'
import { currentAdmin } from '../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await currentAdmin(event)
  return { user: admin ? { username: admin.username } : null }
})
