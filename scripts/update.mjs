#!/usr/bin/env node
// Installs a released version of Fotobogen over this copy, then (if asked)
// stops the running server so that whatever keeps it running starts the new
// version.
//
//   node scripts/update.mjs 1.2.0 [--server-pid <pid>] [--restart]
//
// Started by the admin's Update button, detached from the server, so the
// update carries on even if the server is restarted part-way. Also what
// `pnpm fotobogen update` runs. Progress is written to
// data/update-status.json, which the admin reads.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { dataPaths, resolveDataDir } from '../server/core/paths.ts'
import { runUpdate } from '../server/core/updater.ts'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
process.chdir(root)
if (existsSync('.env')) process.loadEnvFile('.env')

const [version, ...flags] = process.argv.slice(2)
const flag = name => flags.includes(name)
const value = (name) => {
  const at = flags.indexOf(name)
  return at === -1 ? undefined : flags[at + 1]
}
const paths = dataPaths(resolveDataDir(process.env, root))

/** A copy of the database as it is now. Changes to the database only go forward, so this is the way back. */
function snapshot() {
  if (!existsSync(paths.db)) return null
  const file = join(paths.root, `before-update-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  const db = new Database(paths.db, { fileMustExist: true })
  db.pragma('busy_timeout = 5000')
  try {
    db.prepare('VACUUM INTO ?').run(file)
  }
  finally {
    db.close()
  }
  return file
}

const result = await runUpdate({ root, dataDir: paths.root, version: String(version ?? ''), snapshot })
for (const line of result.log) console.log(line)
if (result.state !== 'done') {
  console.error(`\nThe update did not go through. ${result.error}`)
  process.exit(1)
}
console.log(`\nVersion ${result.version} is installed. It takes effect when Fotobogen is restarted.`)

// Stop the running server, so that pm2 (or whatever keeps it running) starts the new version.
const serverPid = Number(value('--server-pid'))
if (flag('--restart') && Number.isInteger(serverPid) && serverPid > 1) {
  try {
    process.kill(serverPid, 'SIGTERM')
    console.log('The running server was asked to stop, so that the new version starts in its place.')
  }
  catch { /* it had already stopped */ }
}
