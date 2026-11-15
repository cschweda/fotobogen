// What every pipeline function needs. The server builds one at boot; the
// command-line tool builds its own on the same data directory.
import type { Database } from 'better-sqlite3'
import type { Storage } from '../storage/types.ts'
import type { Registry } from '../modules/registry.ts'
import type { Limits } from './limits.ts'

export interface PipelineContext {
  sqlite: Database
  storage: Storage
  limits: Limits
  /** Scratch space on the same disk as the originals, so moves are renames. */
  tmpDir: string
  /** Modules whose transforms a photo's recipe may use. Absent in the command-line tool. */
  modules?: Registry
}
