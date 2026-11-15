// The wizard's final submit. Nothing is written before this, and everything
// is written in one transaction, so setup either happens fully or not at all.
import { defineEventHandler, readBody } from 'nuxt/server'
import { fieldErrors, setupSchema } from '../../../shared/schemas.ts'
import { newId } from '../../core/ids.ts'
import { hashPassword } from '../../core/password.ts'
import { deleteSetupToken, readSetupToken, tokensMatch } from '../../core/setup-token.ts'
import { users } from '../../db/schema.ts'
import { getDb, getPaths, markSetupComplete } from '../../utils/app.ts'
import { failureLimiter, limiterKey, tooManyAttempts } from '../../utils/limiter.ts'
import { fail } from '../../utils/respond.ts'
import { startSampleFetch } from '../../utils/samples.ts'
import { signIn } from '../../utils/session.ts'
import { setSettings } from '../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  const key = limiterKey(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  const given = typeof body?.token === 'string' ? body.token.trim() : ''

  // No await between the block check and counting a failure, so attempts
  // made at the same moment are all counted.
  if (failureLimiter.isBlocked(key)) return tooManyAttempts(event, key)
  if (!tokensMatch(given, readSetupToken(getPaths().setupToken) ?? '')) {
    failureLimiter.recordFailure(key)
    return fail(event, 401, 'That setup token is not correct. Copy it from the server log and try again.')
  }

  const parsed = setupSchema.safeParse(body)
  if (!parsed.success) {
    return fail(event, 422, 'Some answers need another look.', { errors: fieldErrors(parsed.error) })
  }
  const answers = parsed.data

  // Hashing is slow and asynchronous, so it happens before the transaction.
  const user = { id: newId(), sessionVersion: 1 }
  const passwordHash = await hashPassword(answers.password)

  const created = getDb().transaction((tx) => {
    // Re-check inside the transaction: another request may have finished first.
    if (tx.select({ id: users.id }).from(users).limit(1).get()) return false
    tx.insert(users).values({
      id: user.id,
      username: answers.username,
      passwordHash,
      role: 'admin',
      sessionVersion: user.sessionVersion,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    }).run()
    setSettings({
      'site.title': answers.siteTitle,
      'site.tagline': answers.tagline,
      'layout.grid': answers.grid,
      'layout.photo_view': answers.photoView,
      'samples.requested': answers.samples,
      'skin.active': 'swiss',
      'privacy.show_exif': true,
      'privacy.show_location': false,
      'privacy.allow_original_download': false,
      'site.setup_complete': true,
    }, tx)
    return true
  })
  if (!created) return fail(event, 404, 'Setup has already been completed.')

  markSetupComplete()
  deleteSetupToken(getPaths().setupToken)
  await signIn(event, user)
  // Runs in the background; setup is finished whether or not it succeeds.
  if (answers.samples) startSampleFetch()
  return { ok: true }
})
