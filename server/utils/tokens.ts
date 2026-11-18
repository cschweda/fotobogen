// API tokens: a way for a script or another program to use part of the
// admin's API without the admin's password or a browser.
//
// A token is shown once, when it is made. Only its hash is stored. Each
// token has a scope, and a scope names exactly the requests it allows;
// anything not named is refused. No token can change settings, make or
// revoke tokens, download a backup, or restore one.
import { createHash, randomBytes } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { newId } from '../core/ids.ts'
import { apiTokens } from '../db/schema.ts'
import { getDb } from './app.ts'

export const TOKEN_PREFIX = 'fb_'
export const TOKEN_SCOPES = ['upload', 'manage'] as const
export type TokenScope = typeof TOKEN_SCOPES[number]
export const MAX_TOKENS = 50
export const TOKEN_NAME_MAX = 60

/** What each scope may do, in words, for the admin and the documentation. */
export const SCOPE_ABOUT: Record<TokenScope, { label: string, about: string }> = {
  upload: { label: 'Upload only', about: 'Upload photos, list the library, and see whether a photo has been processed. It can try again with an upload that failed, and can change or delete nothing else.' },
  manage: { label: 'Manage photos', about: 'Everything Upload can do, and also edit, reorder, hide, and delete photos, set their looks, and manage albums.' },
}

type Rule = [methods: string[], path: RegExp]
// One photo's id, or one album's.
const ID = '[A-Za-z0-9_-]+'
const UPLOAD: Rule[] = [
  [['GET', 'HEAD', 'POST'], /^\/api\/admin\/photos$/],
  [['GET', 'HEAD'], new RegExp(`^/api/admin/photos/${ID}$`)],
  [['POST'], new RegExp(`^/api/admin/photos/${ID}/retry$`)],
]
const MANAGE: Rule[] = [
  ...UPLOAD,
  // Any change to photos or albums.
  [['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], /^\/api\/admin\/(photos|albums)(\/.*)?$/],
  [['GET', 'HEAD'], /^\/api\/admin\/overview$/],
]
const RULES: Record<TokenScope, Rule[]> = { upload: UPLOAD, manage: MANAGE }

/** Whether a token of this scope may make this request. Anything not listed is refused. */
export function tokenAllows(scope: string, method: string, path: string): boolean {
  const rules = RULES[scope as TokenScope]
  // Never the tokens themselves, whatever a future rule says.
  if (!rules || path.startsWith('/api/admin/tokens')) return false
  return rules.some(([methods, pattern]) => methods.includes(method.toUpperCase()) && pattern.test(path))
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export interface TokenInfo { id: string, name: string, prefix: string, scope: TokenScope, createdAt: number, lastUsedAt: number | null }
const info = (row: typeof apiTokens.$inferSelect): TokenInfo => ({ id: row.id, name: row.name, prefix: row.prefix, scope: row.scope as TokenScope, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt })

export function listTokens(): TokenInfo[] {
  return getDb().select().from(apiTokens).orderBy(desc(apiTokens.createdAt)).all().map(info)
}

/** Makes a token. The token itself is returned here and never again. */
export function createToken(name: string, scope: TokenScope): { token: string, info: TokenInfo } {
  // 32 random bytes: far beyond guessing, so no limit on attempts is needed.
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url')
  const row = { id: newId(), name, tokenHash: hash(token), prefix: token.slice(0, 9), scope, createdAt: Date.now(), lastUsedAt: null }
  getDb().insert(apiTokens).values(row).run()
  return { token, info: info(row) }
}

export function revokeToken(id: string): boolean {
  return getDb().delete(apiTokens).where(eq(apiTokens.id, id)).run().changes > 0
}

/** The token a request presented, if it is one that exists. Notes when it was last used, at most once a minute. */
export function findToken(token: string): TokenInfo | null {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 100) return null
  const row = getDb().select().from(apiTokens).where(eq(apiTokens.tokenHash, hash(token))).get()
  if (!row) return null
  const now = Date.now()
  if (!row.lastUsedAt || now - row.lastUsedAt > 60_000) getDb().update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.id)).run()
  return info(row)
}

/** The token in an Authorization header, or null if the header is not "Bearer fb_…". */
export function bearerToken(header: string | undefined | null): string | null {
  const match = /^Bearer\s+(fb_[A-Za-z0-9_-]+)$/i.exec(header?.trim() ?? '')
  return match ? match[1]! : null
}
