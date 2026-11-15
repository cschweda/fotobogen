import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalStorage, isStorageKey } from '../../server/storage/local.ts'

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'fb-storage-'))
  const storage = createLocalStorage({ originals: join(root, 'originals'), derivatives: join(root, 'derivatives') })
  const source = join(root, 'incoming')
  writeFileSync(source, 'picture bytes')
  return { root, storage, source }
}

async function read(stream: NodeJS.ReadableStream): Promise<string> {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

describe('local storage', () => {
  it('moves a file in and reads it back', async () => {
    const { root, storage, source } = setup()
    await storage.put('originals', 'abc123.jpg', source)
    expect(existsSync(source)).toBe(false)
    expect(readFileSync(join(root, 'originals', 'abc123.jpg'), 'utf8')).toBe('picture bytes')
    expect(await read(storage.get('originals', 'abc123.jpg'))).toBe('picture bytes')
    expect(await storage.size('originals', 'abc123.jpg')).toBe(13)
    expect((await storage.read('originals', 'abc123.jpg'))!.toString()).toBe('picture bytes')
    expect(await storage.read('originals', 'missing.jpg')).toBeNull()
  })
  it('keeps the two areas apart', async () => {
    const { storage, source } = setup()
    await storage.put('derivatives', 'abc123-thumb-0a1b2c3d.webp', source)
    expect(await storage.size('derivatives', 'abc123-thumb-0a1b2c3d.webp')).toBe(13)
    expect(await storage.size('originals', 'abc123-thumb-0a1b2c3d.webp')).toBeNull()
  })
  it('deletes a file, and deleting a missing file is not an error', async () => {
    const { storage, source } = setup()
    await storage.put('originals', 'abc123.jpg', source)
    await storage.delete('originals', 'abc123.jpg')
    expect(await storage.size('originals', 'abc123.jpg')).toBeNull()
    await storage.delete('originals', 'abc123.jpg')
  })
  it('gives derivatives a public address under /media/', () => {
    const { storage } = setup()
    expect(storage.publicUrl('abc123-thumb-0a1b2c3d.webp')).toBe('/media/abc123-thumb-0a1b2c3d.webp')
  })
  it('refuses keys that could leave the storage directory', async () => {
    const { storage, source } = setup()
    for (const key of ['../secret', 'a/b.jpg', 'a\\b.jpg', '..', '.hidden', '', 'x'.repeat(201), 'a b.jpg', 'C:evil']) {
      expect(isStorageKey(key), key).toBe(false)
      expect(() => storage.localPath('originals', key), key).toThrow(/storage key/)
      await expect(storage.put('originals', key, source)).rejects.toThrow(/storage key/)
      expect(() => storage.publicUrl(key)).toThrow(/storage key/)
    }
    expect(isStorageKey('V1StGXR8_Z5j-large-0a1b2c3d.webp')).toBe(true)
  })
})
