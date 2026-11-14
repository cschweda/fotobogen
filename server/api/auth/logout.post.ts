import { defineEventHandler } from 'nuxt/server'
import { signOut } from '../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await signOut(event)
  return { ok: true }
})
