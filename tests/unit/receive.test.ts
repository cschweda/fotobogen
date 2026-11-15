import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { receiveUpload } from '../../server/pipeline/receive.ts'

const BOUNDARY = 'test-boundary'
const contentType = `multipart/form-data; boundary=${BOUNDARY}`
const head = (field = 'file', filename = 'photo.jpg') =>
  Buffer.from(`--${BOUNDARY}\r\ncontent-disposition: form-data; name="${field}"; filename="${filename}"\r\ncontent-type: image/jpeg\r\n\r\n`)
const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`)
const dir = () => mkdtempSync(join(tmpdir(), 'fb-receive-'))

/** A request body that yields the chunks, then does what `then` says. */
function body(chunks: Buffer[], then: 'end' | 'error' | 'stall' | 'close' = 'end'): Readable {
  const queue = [...chunks]
  return new Readable({
    read() {
      const next = queue.shift()
      if (next) return void this.push(next)
      if (then === 'end') this.push(null)
      else if (then === 'error') this.destroy(new Error('socket hang up'))
      else if (then === 'close') this.destroy()
      // 'stall': never push again
    },
  })
}

describe('receiveUpload', () => {
  it('writes the file field to a temp file', async () => {
    const tmpDir = dir()
    const received = await receiveUpload(body([head(), Buffer.from('picture bytes'), tail]), { contentType, tmpDir, maxBytes: 1000 })
    expect(received).toMatchObject({ kind: 'file', filename: 'photo.jpg', tooLarge: false })
    if (received.kind !== 'file') return
    expect(readFileSync(received.tmpPath, 'utf8')).toBe('picture bytes')
    expect(readdirSync(tmpDir)).toHaveLength(1)
  })

  it('reports a file over the limit without keeping more than the limit', async () => {
    const tmpDir = dir()
    const received = await receiveUpload(body([head(), Buffer.alloc(5000, 0x41), tail]), { contentType, tmpDir, maxBytes: 1000 })
    expect(received).toMatchObject({ kind: 'file', tooLarge: true })
    if (received.kind === 'file') expect(readFileSync(received.tmpPath).length).toBeLessThanOrEqual(1000)
  })

  it('ignores fields that are not called "file"', async () => {
    const tmpDir = dir()
    expect(await receiveUpload(body([head('avatar'), Buffer.from('x'), tail]), { contentType, tmpDir, maxBytes: 1000 })).toEqual({ kind: 'none' })
    expect(readdirSync(tmpDir)).toEqual([])
  })

  for (const ending of ['error', 'close', 'stall'] as const) {
    it(`fails and leaves no temp file when the connection ends in "${ending}" part-way through`, async () => {
      const tmpDir = dir()
      const upload = receiveUpload(body([head(), Buffer.alloc(4000, 0x41)], ending), { contentType, tmpDir, maxBytes: 1_000_000, idleMs: 150 })
      await expect(upload).rejects.toThrow(ending === 'stall' ? /stalled/ : ending === 'close' ? /interrupted/ : /hang up/)
      expect(readdirSync(tmpDir)).toEqual([])
    })
  }

  it('fails cleanly on a body that is not multipart at all', async () => {
    const tmpDir = dir()
    await expect(receiveUpload(body([Buffer.from('just some text')]), { contentType, tmpDir, maxBytes: 1000 })).rejects.toThrow()
    expect(readdirSync(tmpDir)).toEqual([])
  })
})
