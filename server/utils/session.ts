// Admin sessions: a sealed cookie holding the user's id and session version.
// Nuxt's built-in session is used with the secret from data/secret passed
// explicitly, so no environment variable is needed (DESIGN.md section 6).
import { eq } from 'drizzle-orm'
import { createError, getRequestHeader, getRequestURL, useSession, type RequestEvent } from 'nuxt/server'
import { config } from '../core/config.ts'
import { isLoopbackHost } from '../core/request.ts'
import { users } from '../db/schema.ts'
import { getDb, getSecret } from './app.ts'
import { bearerToken, findToken, tokenAllows } from './tokens.ts'

interface SessionData extends Record<string, unknown> {
  uid?: string
  /** The user's session_version at login. A mismatch means signed out. */
  sv?: number
}

export interface AdminUser {
  id: string
  username: string
  /** Set when the request came with an API token instead of a login. */
  token?: { id: string, name: string, scope: string }
}

const THIRTY_DAYS = 60 * 60 * 24 * config.internals.auth.sessionDays

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

/**
 * A request that presents an API token is judged by the token alone: a
 * login cookie sent with it is ignored. Tokens work only on the admin's API,
 * never on its pages, and only for what the token's scope names.
 */
function lookUpToken(event: RequestEvent, token: string): AdminUser {
  const url = getRequestURL(event)
  const found = url.pathname.startsWith('/api/admin/') ? findToken(token) : null
  if (!found) throw createError({ status: 401, message: 'This token is not valid. It may have been revoked.' })
  if (!tokenAllows(found.scope, event.req.method, url.pathname)) {
    throw createError({ status: 403, message: `The token "${found.name}" is not allowed to do this. See what each kind of token can do under Admin, API tokens.` })
  }
  return { id: `token:${found.id}`, username: `token: ${found.name}`, token: { id: found.id, name: found.name, scope: found.scope } }
}

async function lookUpAdmin(event: RequestEvent): Promise<AdminUser | null> {
  const token = bearerToken(getRequestHeader(event, 'authorization'))
  if (token) return lookUpToken(event, token)
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
