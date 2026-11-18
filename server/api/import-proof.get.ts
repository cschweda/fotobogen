// Proves to `fotobogen import`, running on this machine, that it has reached
// this site and no other program: see server/core/import-pass.ts. It gives
// nothing away. Without the question a run has just written into this
// site's own database, the answer is "not found".
import { defineEventHandler, getQuery } from 'nuxt/server'
import { CHALLENGE_KEY, proofFor, sameText } from '../core/import-pass.ts'
import { fail } from '../utils/respond.ts'
import { getSetting } from '../utils/settings.ts'

export default defineEventHandler((event) => {
  event.res.headers.set('cache-control', 'no-store')
  const asked = getQuery(event).nonce
  const challenge = getSetting<{ nonce?: unknown, key?: unknown, expires?: unknown } | null>(CHALLENGE_KEY, null)
  // The connection itself, wherever this version of the server keeps it.
  const held = event as unknown as { node?: { req?: { socket?: { localAddress?: string, localPort?: number } } }, runtime?: { node?: { req?: { socket?: { localAddress?: string, localPort?: number } } } } }
  const socket = held.runtime?.node?.req?.socket ?? held.node?.req?.socket
  if (typeof asked !== 'string' || !challenge || typeof challenge.nonce !== 'string' || typeof challenge.key !== 'string'
    || typeof challenge.expires !== 'number' || challenge.expires < Date.now() || !sameText(asked, challenge.nonce)
    || !socket?.localAddress || !socket.localPort) {
    return fail(event, 404, 'Not found.')
  }
  // The address and port this very connection arrived at: what the command dialled, if it dialled us.
  return { answer: proofFor(challenge.key, challenge.nonce, socket.localAddress, socket.localPort) }
})
