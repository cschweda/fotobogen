// What `fotobogen import` and the site agree on, kept in one place because
// the command (scripts/import.mjs) and the server both need it.
//
// The command lets itself in with an API token it writes into the site's own
// database. Before it sends that token anywhere, it makes the site prove it
// is the site: it writes a question and a key into the database, asks the
// question over the connection, and expects back a code only a program that
// can read that database could make. The code also covers the address and
// port the answer came from, so a program that merely passes the question
// on to the real site, from somewhere else, gets a code that does not fit.
import { createHmac, timingSafeEqual } from 'node:crypto'

/** The setting the question is kept in while a run is starting. */
export const CHALLENGE_KEY = 'import.challenge'
/** How long the site will answer a question for. A run asks at once. */
export const CHALLENGE_MS = 60_000

/**
 * The start of the name of the token a run makes for itself. The full name
 * is longer than the admin lets a name be, so no token made there can pass
 * for one of these, or be cleared away as one.
 */
export const PASS_NAME = 'fotobogen import: a pass for one run, removed when it ends'
/** A pass older than this is refused by the site and cleared away by the next run: the run it was made for was killed. */
export const PASS_HOURS = 12

export const isImportPass = (name: string): boolean => name.startsWith(PASS_NAME) && name.length > 60

/** An address as both ends write it: "::ffff:127.0.0.1" and "[::1]" are 127.0.0.1 and ::1. */
export const plainAddress = (address: string): string => address.replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '').toLowerCase()

/** The code that answers a question, from the end of the connection the site is on. */
export function proofFor(key: string, nonce: string, address: string, port: number): string {
  return createHmac('sha256', key).update(`${nonce}|${plainAddress(address)}|${port}`).digest('hex')
}

export function sameText(a: string, b: string): boolean {
  const [left, right] = [Buffer.from(a), Buffer.from(b)]
  return left.length === right.length && timingSafeEqual(left, right)
}
