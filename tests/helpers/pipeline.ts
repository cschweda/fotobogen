// A pipeline context on a throwaway directory with a real database.
import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMigrations, readMigrationsFromDir } from '../../server/core/migrate.ts'
import type { PipelineContext } from '../../server/pipeline/context.ts'
import { readLimits } from '../../server/pipeline/limits.ts'
import { createLocalStorage } from '../../server/storage/local.ts'

const migrationsDir = fileURLToPath(new URL('../../server/db/migrations', import.meta.url))

export function testContext(env: Record<string, string> = {}): PipelineContext & { root: string } {
  const root = mkdtempSync(join(tmpdir(), 'fb-pipeline-'))
  const tmpDir = join(root, 'tmp')
  mkdirSync(tmpDir)
  const sqlite = new Database(join(root, 'fotobogen.db'))
  sqlite.pragma('foreign_keys = ON')
  applyMigrations(sqlite, readMigrationsFromDir(migrationsDir))
  const storage = createLocalStorage({ originals: join(root, 'originals'), derivatives: join(root, 'derivatives') })
  return { root, sqlite, storage, tmpDir, limits: readLimits(env) }
}

export const rows = <T = Record<string, unknown>>(ctx: PipelineContext, sql: string): T[] =>
  ctx.sqlite.prepare(sql).all() as T[]
