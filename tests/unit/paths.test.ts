import { mkdtempSync, existsSync, chmodSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dataPaths, ensureDataDirs, resolveDataDir } from '../../server/core/paths.ts'

describe('resolveDataDir', () => {
  it('defaults to ./data under the working directory', () => {
    expect(resolveDataDir({}, '/x')).toBe(join('/x', 'data'))
  })
  it('uses an absolute DATA_DIR as given', () => {
    expect(resolveDataDir({ DATA_DIR: '/srv/d' }, '/x')).toBe('/srv/d')
  })
  it('resolves a relative DATA_DIR against the working directory', () => {
    expect(resolveDataDir({ DATA_DIR: 'store' }, '/x')).toBe(resolve('/x', 'store'))
  })
})

// chmod cannot make a directory read-only for root, or for anyone on Windows.
const cannotRestrict = process.platform === 'win32' || process.getuid?.() === 0

describe('ensureDataDirs', () => {
  it('creates the data directory and its subdirectories', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'fb-')), 'data')
    const paths = dataPaths(root)
    ensureDataDirs(paths)
    for (const dir of [paths.originals, paths.derivatives, paths.skins, paths.modules]) {
      expect(existsSync(dir)).toBe(true)
    }
    expect(paths.db).toBe(join(root, 'fotobogen.db'))
    expect(paths.secret).toBe(join(root, 'secret'))
    expect(paths.setupToken).toBe(join(root, 'setup-token'))
  })

  it.skipIf(cannotRestrict)('names the directory when it cannot be written', () => {
    const parent = mkdtempSync(join(tmpdir(), 'fb-'))
    const root = join(parent, 'data')
    mkdirSync(root)
    chmodSync(root, 0o500)
    expect(() => ensureDataDirs(dataPaths(root))).toThrow(root)
    expect(() => ensureDataDirs(dataPaths(root))).toThrow(/cannot write to its data directory/)
    chmodSync(root, 0o700)
  })

  it.skipIf(cannotRestrict)('names a subdirectory it cannot write to', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'fb-')), 'data')
    const paths = dataPaths(root)
    ensureDataDirs(paths)
    chmodSync(paths.derivatives, 0o500)
    expect(() => ensureDataDirs(paths)).toThrow(paths.derivatives)
    chmodSync(paths.derivatives, 0o700)
  })
})
