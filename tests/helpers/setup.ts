import Database from 'better-sqlite3'
import { join } from 'node:path'
import { post, sessionCookie, type TestServer } from './server.ts'

export const ADMIN = { username: 'ansel', password: 'zone system forever' }

export function setupAnswers(server: TestServer, overrides: Record<string, unknown> = {}) {
  return {
    token: server.token(),
    siteTitle: 'Test Photos',
    tagline: 'Pictures of things',
    username: ADMIN.username,
    password: ADMIN.password,
    grid: 'masonry',
    photoView: 'modal',
    samples: false,
    ...overrides,
  }
}

/** Runs the wizard's final submit and returns the admin's session cookie. */
export async function completeSetup(server: TestServer, overrides: Record<string, unknown> = {}): Promise<string> {
  const response = await post(server, '/api/setup/complete', setupAnswers(server, overrides))
  if (response.status !== 200) throw new Error(`Setup failed: ${response.status} ${await response.text()}`)
  return sessionCookie(response)!
}

/** Reads the site's database directly, for checking what the server wrote. */
export function query<T = Record<string, unknown>>(server: TestServer, sql: string): T[] {
  const db = new Database(join(server.dataDir, 'fotobogen.db'), { readonly: true })
  try {
    return db.prepare(sql).all() as T[]
  }
  finally {
    db.close()
  }
}
