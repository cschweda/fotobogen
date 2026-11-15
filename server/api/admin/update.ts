// Updating Fotobogen from the admin: what can be done (GET), and doing it (POST).
//
// Both are in this one file on purpose. While a new version is being built,
// the files of the running one are replaced; code the server has not yet
// loaded could no longer be loaded. This file is loaded by the first GET,
// before any update starts, so it keeps answering throughout.
import { defineEventHandler } from 'nuxt/server'
import { fail } from '../../utils/respond.ts'
import { selfUpdate, startSelfUpdate } from '../../utils/self-update.ts'
import { requireAdmin } from '../../utils/session.ts'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  if (event.req.method === 'GET' || event.req.method === 'HEAD') return await selfUpdate()
  if (event.req.method !== 'POST') return fail(event, 405, 'Use GET to read the state of updates and POST to start one.')
  // Installing new code on the server is for the owner, logged in: never a token, never a demo visitor.
  if (admin.token || admin.demo) return fail(event, 403, 'Only the site\'s owner, logged in, can update Fotobogen.')
  const result = await startSelfUpdate()
  if (!result.started) return fail(event, 409, result.reason)
  return { started: true, ...(await selfUpdate()) }
})
