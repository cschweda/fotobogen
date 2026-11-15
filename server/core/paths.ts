// Where a site keeps everything it owns. Backing up or moving a site means
// copying this one directory (DESIGN.md section 3).
import { accessSync, constants, mkdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export interface DataPaths {
  root: string
  db: string
  secret: string
  setupToken: string
  originals: string
  derivatives: string
  skins: string
  modules: string
  /** Scratch space for uploads in progress; emptied at boot. */
  tmp: string
}

export function resolveDataDir(env: Record<string, string | undefined>, cwd: string): string {
  const configured = env.DATA_DIR?.trim()
  if (!configured) return join(cwd, 'data')
  return isAbsolute(configured) ? configured : resolve(cwd, configured)
}

export function dataPaths(root: string): DataPaths {
  return {
    root,
    db: join(root, 'fotobogen.db'),
    secret: join(root, 'secret'),
    setupToken: join(root, 'setup-token'),
    originals: join(root, 'originals'),
    derivatives: join(root, 'derivatives'),
    skins: join(root, 'skins'),
    modules: join(root, 'modules'),
    tmp: join(root, 'tmp'),
  }
}

export function ensureDataDirs(paths: DataPaths): void {
  // Every directory is checked, not just the root: Docker can create a
  // bind-mounted subdirectory as root before the app first runs.
  for (const dir of [paths.root, paths.originals, paths.derivatives, paths.skins, paths.modules, paths.tmp]) {
    try {
      mkdirSync(dir, { recursive: true })
      accessSync(dir, constants.W_OK)
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Fotobogen cannot write to its data directory: ${dir}. `
        + `Create it and make it writable by the user running the app, or set DATA_DIR. (${reason})`,
      )
    }
  }
}
