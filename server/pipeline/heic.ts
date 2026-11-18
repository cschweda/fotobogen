// HEIC, the format an iPhone saves in. The image library that does
// everything else here cannot open it (the codec inside is HEVC, which its
// ready-made builds leave out), so a HEIC is decoded once, when it arrives,
// by libheif compiled to WebAssembly, and saved as a JPEG beside the file
// that was uploaded. The upload itself is kept untouched, as every original
// is; the JPEG is what the rest of the pipeline reads.
//
// The decoder runs in a process of its own, which also writes the JPEG.
// WebAssembly memory only ever grows, so a decoder loaded into the server
// itself would hold on to the memory of the largest photo it had ever seen
// for as long as the server ran; and a decoded photo is hundreds of
// megabytes that the server would then have to carry too. A process that
// ends gives every byte back to the system, on every platform. It also
// means a file that crashes or hangs the decoder takes that process with
// it, not the site. One photo is decoded at a time.
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { serial } from '../core/serial.ts'

/** The key of the file the image library reads: the original itself, or for a HEIC the JPEG made from it. */
export const readableKey = (originalKey: string): string => originalKey.endsWith('.heic') ? `${originalKey}.jpg` : originalKey

export type HeicResult
  = | { ok: true, width: number, height: number }
    | { ok: false, reason: 'too-many-pixels', pixels: number }
    | { ok: false, reason: 'unreadable' }

/** Long enough for the largest photo allowed on a slow server; a file that takes longer is not going to finish. */
const TIME_LIMIT_MS = 120_000

// Plain CommonJS, run as the process's whole program. It reads the size
// first and stops there when the picture is too large, before any of the
// memory to decode it is asked for. Its answer is one line of JSON.
const DECODER = `
const [source, target, maxPixels, decoderPath, imagePath] = process.argv.slice(1)
const say = answer => process.stdout.write(JSON.stringify(answer))
;(async () => {
  const images = await require(decoderPath).all({ buffer: require('node:fs').readFileSync(source) })
  const image = images[0]
  if (!image || !(image.width > 0) || !(image.height > 0)) return say({ ok: false, reason: 'unreadable' })
  if (image.width * image.height > Number(maxPixels)) return say({ ok: false, reason: 'too-many-pixels', pixels: image.width * image.height })
  const { data, width, height } = await image.decode()
  if (data.length !== width * height * 4) return say({ ok: false, reason: 'unreadable' })
  const sharp = require(imagePath)
  sharp.concurrency(1)
  sharp.cache(false)
  await sharp(Buffer.from(data.buffer, data.byteOffset, data.length), { raw: { width, height, channels: 4 } })
    // Plain coding, not optimised: optimising holds the whole picture in memory a second time (measured: 300 MB more at 24 megapixels).
    .removeAlpha().jpeg({ quality: 95, chromaSubsampling: '4:4:4', optimiseCoding: false }).toFile(target)
  say({ ok: true, width, height })
})().catch(() => say({ ok: false, reason: 'unreadable' }))
`

const oneAtATime = serial()

function convert(source: string, target: string, maxPixels: number): Promise<HeicResult> {
  return new Promise((resolve) => {
    const unreadable: HeicResult = { ok: false, reason: 'unreadable' }
    const require = createRequire(import.meta.url)
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(process.execPath, ['-e', DECODER, source, target, String(maxPixels), require.resolve('heic-decode'), require.resolve('sharp')], {
        // The process gets none of the server's settings or secrets: only what the system needs to start a program.
        env: Object.fromEntries(['PATH', 'SystemRoot', 'windir', 'TEMP', 'TMP'].flatMap(name => process.env[name] ? [[name, process.env[name]]] : [])),
        // What the decoder prints about a file it cannot read stays out of the server's log.
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      })
    }
    catch {
      resolve(unreadable)
      return
    }
    let said = ''
    child.stdout!.on('data', (chunk: Buffer) => { if (said.length < 1000) said += chunk.toString('utf8') })
    const timer = setTimeout(() => child.kill('SIGKILL'), TIME_LIMIT_MS)
    const finish = () => {
      clearTimeout(timer)
      let answer: unknown
      try { answer = JSON.parse(said) }
      catch { /* it ended without an answer: it crashed, or was stopped at the time limit */ }
      const result = answer as { ok?: unknown, reason?: unknown, width?: unknown, height?: unknown, pixels?: unknown } | undefined
      if (result?.ok === true && Number.isInteger(result.width) && Number.isInteger(result.height)) resolve({ ok: true, width: result.width as number, height: result.height as number })
      else if (result?.reason === 'too-many-pixels' && typeof result.pixels === 'number') resolve({ ok: false, reason: 'too-many-pixels', pixels: result.pixels })
      else resolve(unreadable)
    }
    child.once('error', finish)
    child.once('close', finish)
  })
}

/**
 * Decodes the HEIC at `source` and writes it to `target` as a JPEG, upright
 * (the decoder applies the turn the file asks for) and at a quality high
 * enough that the web copies made from it show no loss.
 */
export function heicToJpeg(source: string, target: string, maxPixels: number): Promise<HeicResult> {
  return oneAtATime(async () => {
    const made = await convert(source, target, maxPixels)
    // Nothing half-written is left behind by a decoder that stopped part of the way.
    if (!made.ok) await rm(target, { force: true }).catch(() => undefined)
    return made
  })
}
