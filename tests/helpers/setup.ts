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
  const { acknowledge: _acknowledge, homeOrder: _homeOrder, ...answers } = overrides
  const response = await post(server, '/api/setup/complete', setupAnswers(server, answers))
  if (response.status !== 200) throw new Error(`Setup failed: ${response.status} ${await response.text()}`)
  const cookie = sessionCookie(response)!
  // A new site shows its front page shuffled. Most tests are about the order photos are in, so they
  // ask for the library's order, as an owner may in Settings (tests/server/front-page.test.ts has the shuffle).
  if (overrides.homeOrder !== 'random') {
    const settings = await (await fetch(server.url + '/api/admin/settings', { headers: { cookie } })).json() as Record<string, unknown>
    await fetch(server.url + '/api/admin/settings', { method: 'PUT', headers: { 'origin': server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...settings, homeOrder: 'sequence' }) })
  }
  // An owner presses "I understand" on the backup notice once; most tests start after that.
  if (overrides.acknowledge !== false) {
    await fetch(server.url + '/api/admin/acknowledge', { method: 'POST', headers: { origin: server.url, cookie } })
  }
  return cookie
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
