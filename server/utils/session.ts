// Admin sessions: a sealed cookie holding the user's id and session version.
// Nuxt's built-in session is used with the secret from data/secret passed
// explicitly, so no environment variable is needed (DESIGN.md section 6).
import { eq } from 'drizzle-orm'
import { createError, deleteCookie, getRequestHeader, getRequestURL, useSession, type RequestEvent } from 'nuxt/server'
import { config } from '../core/config.ts'
import { isLoopbackHost } from '../core/request.ts'
import { users } from '../db/schema.ts'
import { getDb, getSecret } from './app.ts'
import { DEMO_HIDDEN, DEMO_REFUSAL, demoAllows, demoModeOn } from './demo.ts'
import { bearerToken, findToken, tokenAllows } from './tokens.ts'

interface SessionData extends Record<string, unknown> {
  uid?: string
  /** The user's session_version at login. A mismatch means signed out. */
  sv?: number
  /** When this login was made. A login ends after MAX_LOGIN_AGE however much it is used. */
  at?: number
  /** A demo visitor: no account, and read-only. Only honoured while demo mode is on. */
  demo?: boolean
}

export interface AdminUser {
  id: string
  username: string
  /** A demo visitor, who may look but not change anything. */
  demo?: boolean
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

/**
 * The note about a new version can be closed for a session; the browser keeps
 * that in this cookie. A new login starts a new session, so the note is shown again.
 */
/** The longest one login lasts, however much it is used: 90 days. Then the password is asked for again. */
const MAX_LOGIN_AGE = 90 * 24 * 60 * 60 * 1000

export const UPDATE_NOTE_COOKIE = 'fb-update-note'

export async function signIn(event: RequestEvent, user: { id: string, sessionVersion: number }): Promise<void> {
  const session = await adminSession(event)
  await session.update({ uid: user.id, sv: user.sessionVersion, at: Date.now() })
  deleteCookie(event, UPDATE_NOTE_COOKIE, { path: '/' })
  event.context.admin = undefined
}

/** Signs in a demo visitor: a session with no account behind it. */
export async function signInDemo(event: RequestEvent): Promise<void> {
  const session = await adminSession(event)
  await session.update({ uid: undefined, sv: undefined, demo: true })
  deleteCookie(event, UPDATE_NOTE_COOKIE, { path: '/' })
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
  const { uid, sv, demo, at } = session.data
  // A demo session lasts only while the server has demo mode switched on.
  if (demo && !uid) return demoModeOn() ? { id: 'demo', username: 'demo', demo: true } : null
  if (!uid) return null
  const user = getDb().select().from(users).where(eq(users.id, uid)).get()
  if (!user || user.sessionVersion !== sv) return null
  // Using a session renews its cookie, but not for ever: a cookie that was
  // copied from a browser stops working when the login it came from is this old.
  const started = typeof at === 'number' ? at : Date.now()
  if (Date.now() - started > MAX_LOGIN_AGE) return null
  await session.update({ uid, sv, at: started })
  return { id: user.id, username: user.username }
}

export async function requireAdmin(event: RequestEvent): Promise<AdminUser> {
  const admin = await currentAdmin(event)
  if (!admin) throw createError({ status: 401, message: 'Log in to continue.' })
  // A demo visitor may read what is listed for them and change nothing. It is
  // checked here, where every admin endpoint asks who is calling, as well as
  // in the guard that runs first, so the rule holds however a request got here.
  if (admin.demo) {
    const allowed = demoAllows(event.req.method, getRequestURL(event).pathname)
    if (allowed !== 'yes') throw createError({ status: 403, message: allowed === 'changes' ? DEMO_REFUSAL : DEMO_HIDDEN })
  }
  return admin
}
