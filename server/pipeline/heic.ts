// HEIC, the format an iPhone saves in. The image library that does
// everything else here cannot open it (the codec inside is HEVC, which its
// ready-made builds leave out), so a HEIC is decoded once, when it arrives,
// by libheif compiled to WebAssembly, and saved as a JPEG beside the file
// that was uploaded. The upload itself is kept untouched, as every original
// is; the JPEG is what the rest of the pipeline reads.
//
// The decoder runs in a thread of its own. WebAssembly memory only ever
// grows, so a decoder loaded into the server itself would hold on to the
// memory of the largest photo it had ever seen for as long as the server
// ran. Ending the thread gives it all back. It also means a file that
// crashes or hangs the decoder takes the thread with it, not the site.
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import sharp from './image.ts'

/** The key of the file the image library reads: the original itself, or for a HEIC the JPEG made from it. */
export const readableKey = (originalKey: string): string => originalKey.endsWith('.heic') ? `${originalKey}.jpg` : originalKey

export type HeicResult
  = | { ok: true, width: number, height: number }
    | { ok: false, reason: 'too-many-pixels', pixels: number }
    | { ok: false, reason: 'unreadable' }

/** Long enough for the largest photo allowed on a slow server; a file that takes longer is not going to finish. */
const TIME_LIMIT_MS = 120_000

// Plain CommonJS, run as the thread's whole program. It reads the size
// first and stops there when the picture is too large, before any of the
// memory to decode it is asked for.
const DECODER = `
const { parentPort, workerData } = require('node:worker_threads')
const { readFileSync } = require('node:fs')
;(async () => {
  const decode = require(workerData.decoder)
  const images = await decode.all({ buffer: readFileSync(workerData.source) })
  const image = images[0]
  if (!image || !(image.width > 0) || !(image.height > 0)) return parentPort.postMessage({ ok: false, reason: 'unreadable' })
  if (image.width * image.height > workerData.maxPixels) return parentPort.postMessage({ ok: false, reason: 'too-many-pixels', pixels: image.width * image.height })
  const { data, width, height } = await image.decode()
  parentPort.postMessage({ ok: true, width, height, data }, [data.buffer])
})().catch(() => parentPort.postMessage({ ok: false, reason: 'unreadable' }))
`

type Decoded = { ok: true, width: number, height: number, data: Uint8ClampedArray } | Exclude<HeicResult, { ok: true }>

function decode(source: string, maxPixels: number): Promise<Decoded> {
  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(DECODER, {
        eval: true,
        workerData: { source, maxPixels, decoder: createRequire(import.meta.url).resolve('heic-decode') },
        // The thread gets none of the server's settings or secrets.
        env: {},
        // What the decoder prints about a file it cannot read stays out of the server's log.
        stdout: true,
        stderr: true,
      })
    }
    catch {
      resolve({ ok: false, reason: 'unreadable' })
      return
    }
    let done = false
    const finish = (result: Decoded) => {
      if (done) return
      done = true
      clearTimeout(timer)
      // The thread is ended, and its memory given back, before the picture is handed on to be saved.
      void worker.terminate().catch(() => undefined).then(() => resolve(result))
    }
    const timer = setTimeout(() => finish({ ok: false, reason: 'unreadable' }), TIME_LIMIT_MS)
    worker.once('message', finish)
    worker.once('error', () => finish({ ok: false, reason: 'unreadable' }))
    worker.once('exit', () => finish({ ok: false, reason: 'unreadable' }))
  })
}

/**
 * Decodes the HEIC at `source` and writes it to `target` as a JPEG, upright
 * (the decoder applies the turn the file asks for) and at a quality high
 * enough that the web copies made from it show no loss.
 */
export async function heicToJpeg(source: string, target: string, maxPixels: number): Promise<HeicResult> {
  const decoded = await decode(source, maxPixels)
  if (!decoded.ok) return decoded
  const { width, height, data } = decoded
  if (data.length !== width * height * 4) return { ok: false, reason: 'unreadable' }
  await sharp(Buffer.from(data.buffer, data.byteOffset, data.length), { raw: { width, height, channels: 4 } })
    .removeAlpha()
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toFile(target)
  return { ok: true, width, height }
}
