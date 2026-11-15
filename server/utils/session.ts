// Admin sessions: a sealed cookie holding the user's id and session version.
// Nuxt's built-in session is used with the secret from data/secret passed
// explicitly, so no environment variable is needed (DESIGN.md section 6).
import { eq } from 'drizzle-orm'
import { createError, getRequestHeader, useSession, type RequestEvent } from 'nuxt/server'
import { isLoopbackHost } from '../core/request.ts'
import { users } from '../db/schema.ts'
import { getDb, getSecret } from './app.ts'

interface SessionData extends Record<string, unknown> {
  uid?: string
  /** The user's session_version at login. A mismatch means signed out. */
  sv?: number
}

export interface AdminUser {
  id: string
  username: string
}

const THIRTY_DAYS = 60 * 60 * 24 * 30

function adminSession(event: RequestEvent) {
  return useSession<SessionData>(event, {
    password: getSecret(),
    name: 'fotobogen',
    maxAge: THIRTY_DAYS,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // Always Secure, except on localhost so local use works over plain HTTP.
      secure: !isLoopbackHost(getRequestHeader(event, 'host')),
    },
  })
}

export async function signIn(event: RequestEvent, user: { id: string, sessionVersion: number }): Promise<void> {
  const session = await adminSession(event)
  await session.update({ uid: user.id, sv: user.sessionVersion })
  event.context.admin = undefined
}

export async function signOut(event: RequestEvent): Promise<void> {
  const session = await adminSession(event)
  await session.clear()
  event.context.admin = null
}

/**
 * The logged-in admin, or null. Never throws for a missing or stale session.
 * Using a session renews it: the cookie is re-issued with a fresh 30 days,
 * so an admin who keeps using the site is never logged out by the calendar.
 */
export async function currentAdmin(event: RequestEvent): Promise<AdminUser | null> {
  // The guard and the handler both ask; look up and renew once per request.
  if (event.context.admin !== undefined) return event.context.admin as AdminUser | null
  event.context.admin = await lookUpAdmin(event)
  return event.context.admin as AdminUser | null
}

async function lookUpAdmin(event: RequestEvent): Promise<AdminUser | null> {
  if (!getRequestHeader(event, 'cookie')?.includes('fotobogen=')) return null
  const session = await adminSession(event)
  const { uid, sv } = session.data
  if (!uid) return null
  const user = getDb().select().from(users).where(eq(users.id, uid)).get()
  if (!user || user.sessionVersion !== sv) return null
  await session.update({ uid, sv })
  return { id: user.id, username: user.username }
}

export async function requireAdmin(event: RequestEvent): Promise<AdminUser> {
  const admin = await currentAdmin(event)
  if (!admin) throw createError({ status: 401, message: 'Log in to continue.' })
  return admin
}
