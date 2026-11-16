// What the System page shows: version, what is stored, and whether a restore is waiting.
import { existsSync, readdirSync, statfsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineEventHandler, useRuntimeConfig } from 'nuxt/server'
import { PENDING_ADMIN_RESTORE, PENDING_RESTORE } from '../../core/backup.ts'
import { getPaths, getQueue, getSqlite } from '../../utils/app.ts'
import { requireAdmin } from '../../utils/session.ts'

function folderBytes(dir: string): number {
  if (!existsSync(dir)) return 0
  let bytes = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    bytes += entry.isDirectory() ? folderBytes(path) : statSync(path).size
  }
  return bytes
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const paths = getPaths()
  let freeBytes: number | null = null
  try {
    const disk = statfsSync(paths.root)
    freeBytes = Number(disk.bavail) * Number(disk.bsize)
  }
  catch { /* not every filesystem can say */ }
  const { photos } = getSqlite().prepare(`select count(*) as photos from photos`).get() as { photos: number }
  return {
    version: String(useRuntimeConfig().appVersion),
    node: process.versions.node,
    photos,
    queueDepth: getQueue().depth(),
    originalsBytes: folderBytes(paths.originals),
    derivativesBytes: folderBytes(paths.derivatives),
    databaseBytes: existsSync(paths.db) ? statSync(paths.db).size : 0,
    freeBytes,
    restorePending: existsSync(join(paths.root, PENDING_ADMIN_RESTORE)) || existsSync(join(paths.root, PENDING_RESTORE)),
  }
})
