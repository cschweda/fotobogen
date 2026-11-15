// Photo files on the local disk: originals in data/originals, resized
// copies in data/derivatives. Keys are flat file names.
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Storage, StorageArea } from './types.ts'

// Starts with a letter, digit, underscore or hyphen (ids may), then the same
// plus dots. No slashes, backslashes, colons or spaces, and never "..".
const KEY = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/

export function isStorageKey(key: string): boolean {
  return KEY.test(key) && !key.includes('..')
}

function checked(key: string): string {
  if (!isStorageKey(key)) throw new Error(`Not a valid storage key: ${JSON.stringify(key)}`)
  return key
}

// Windows refuses to move or delete a file that another handle still has
// open (a virus scanner, or a reader that has not quite let go). Try again
// briefly before giving up.
const RM = { force: true, maxRetries: 10, retryDelay: 50 }
const BUSY = new Set(['EBUSY', 'EPERM', 'EACCES'])

async function moveWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to)
    }
    catch (error) {
      if (attempt >= 10 || !BUSY.has((error as NodeJS.ErrnoException).code ?? '')) throw error
      await new Promise(wait => setTimeout(wait, 50))
    }
  }
}

export function createLocalStorage(dirs: Record<StorageArea, string>): Storage {
  const localPath = (area: StorageArea, key: string) => join(dirs[area], checked(key))

  return {
    localPath,

    async put(area, key, fromPath) {
      const target = localPath(area, key)
      await mkdir(dirs[area], { recursive: true })
      try {
        await moveWithRetry(fromPath, target)
      }
      catch (error) {
        // A different disk: copy, then remove the source.
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
        await copyFile(fromPath, target)
        await rm(fromPath, RM)
      }
    },

    get: (area, key) => createReadStream(localPath(area, key)),

    async size(area, key) {
      try {
        const info = await stat(localPath(area, key))
        return info.isFile() ? info.size : null
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },

    async delete(area, key) {
      await rm(localPath(area, key), RM)
    },

    publicUrl: key => `/media/${checked(key)}`,
  }
}
