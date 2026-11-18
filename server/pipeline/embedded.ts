// Words saved inside a photo. Lightroom, Capture One, Apple Photos and most
// other programs write a photo's title, caption and keywords into the file
// itself when it is exported: as XMP, or in the older IPTC form. Reading
// them on upload means a library kept in such a program arrives with its
// words, instead of the owner typing them all again.
//
// Everything here comes out of an uploaded file, so every value is checked,
// cleaned and cut to length before it is used. The words are only ever
// stored and shown as text.
import type exifr from 'exifr'
import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'
import type { PipelineContext } from './context.ts'
import { saysSomething, withoutUnseen } from '../../shared/visible-text.ts'
import { datesAsWritten } from './exif.ts'

export interface EmbeddedWords {
  title: string | null
  description: string | null
  /** Alt text, from the field made for it (IPTC "Alt Text (Accessibility)", 2021). Few programs write it yet. */
  alt: string | null
  tags: string[]
  /** When the photo was taken, in milliseconds, as the camera wrote it; null when the file does not say. */
  takenAt: number | null
}

export const NO_WORDS: EmbeddedWords = { title: null, description: null, alt: null, tags: [], takenAt: null }

/** What to ask the metadata reader for: the words, and the date. Kept in separate groups so one cannot pass for another. */
// (The reader's own types do not know every one of its options, hence the cast.)
export const WORDS_OPTIONS = { xmp: true, iptc: true, ifd0: true, exif: true, gps: false, icc: false, mergeOutput: false } as unknown as Exclude<Parameters<typeof exifr.parse>[1], undefined>

// The same lengths the library allows when the owner types (library.ts, collections.ts).
const LIMITS = { title: 200, description: 5000, alt: 500, tag: 60, tags: 30 }

/** What cameras write into the description by themselves. Not a description of anything. */
const CAMERA_BOILERPLATE = /^(olympus digital camera|sony dsc|dcim\w*|(konica )?minolta digital camera|digital camera|exif_jpeg_picture|samsung( camera pictures)?|processed with \w+.*|created with \w+.*|charset=.*|default|untitled|sdr|hdr|screenshot)$/i

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' }
/** XMP is XML, and the reader hands its text back still escaped. */
function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole
    const code = name[1]!.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10)
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ''
  })
}

/**
 * IPTC text arrives as one character per byte. Nearly every program now
 * writes UTF-8, so if the bytes are valid UTF-8 they are read as that
 * ("CafÃ©" becomes "Café"); otherwise they are left as they came.
 */
function fromBytes(text: string): string {
  if (!/[\u0080-ÿ]/.test(text) || /[^\u0000-ÿ]/.test(text)) return text
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(text, 'latin1'))
  }
  catch {
    return text
  }
}

/** One line of text: no control characters, spaces collapsed, cut to length. Null when nothing is left. */
function line(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const clean = withoutUnseen(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
  return saysSomething(clean) ? [...clean].slice(0, limit).join('').trim() || null : null
}

/** Several lines of text: line breaks kept, every other control character dropped. */
function paragraphs(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const clean = withoutUnseen(value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '').trim()
  return saysSomething(clean) ? [...clean].slice(0, limit).join('').trim() || null : null
}

/** XMP text in several languages comes as { lang, value }, or a list of them; the default language is first. */
function xmpText(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value.find(item => (item as { lang?: unknown } | null)?.lang === 'x-default') ?? value[0] : value
  const text = typeof first === 'string' ? first : (first as { value?: unknown } | null)?.value
  return typeof text === 'string' ? unescapeXml(text) : undefined
}

const group = (parsed: unknown, name: string): Record<string, unknown> => {
  const found = (parsed as Record<string, unknown> | null | undefined)?.[name]
  return found && typeof found === 'object' && !Array.isArray(found) ? found as Record<string, unknown> : {}
}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]

/** Picks the words out of what the metadata reader found (asked with WORDS_OPTIONS). Never throws. */
export function embeddedWords(parsed: unknown): EmbeddedWords {
  const [dc, accessibility, iptc, ifd0] = [group(parsed, 'dc'), group(parsed, 'Iptc4xmpCore'), group(parsed, 'iptc'), group(parsed, 'ifd0')]
  const iptcText = (value: unknown) => typeof value === 'string' ? fromBytes(value) : undefined

  const cameraNote = line(ifd0.ImageDescription, LIMITS.description)
  const description = paragraphs(xmpText(dc.description), LIMITS.description)
    ?? paragraphs(iptcText(iptc.Caption), LIMITS.description)
    ?? (cameraNote && !CAMERA_BOILERPLATE.test(cameraNote) ? paragraphs(ifd0.ImageDescription, LIMITS.description) : null)

  const keywords = list(dc.subject).length > 0 ? list(dc.subject).map(word => typeof word === 'string' ? unescapeXml(word) : word) : list(iptc.Keywords).map(iptcText)
  const tags: string[] = []
  for (const keyword of keywords) {
    const tag = line(keyword, LIMITS.tag)
    if (tag && !tags.some(kept => kept.toLowerCase() === tag.toLowerCase()) && tags.length < LIMITS.tags) tags.push(tag)
  }

  const dates = datesAsWritten(group(parsed, 'exif'))
  const taken = [dates.DateTimeOriginal, dates.CreateDate].find(date => date instanceof Date && !Number.isNaN(date.getTime())) as Date | undefined

  return {
    title: line(xmpText(dc.title), LIMITS.title) ?? line(iptcText(iptc.ObjectName), LIMITS.title),
    description,
    alt: line(xmpText(accessibility.AltTextAccessibility), LIMITS.alt),
    tags,
    takenAt: taken ? taken.getTime() : null,
  }
}

/** The same, without the words: only what the camera wrote. Nothing in it is slow to read. */
const DATE_OPTIONS = { xmp: false, iptc: false, ifd0: true, exif: true, gps: false, icc: false, mergeOutput: false }

/** Reading the words out of a real photo takes a few milliseconds. A file that needs longer is not going to be read. */
const TIME_LIMIT_MS = 5000

// The whole program of the reading thread. Plain CommonJS.
const READER = `
const { parentPort, workerData } = require('node:worker_threads')
require(workerData.reader).parse(workerData.path, workerData.options)
  .then(found => parentPort.postMessage(found ?? null), () => parentPort.postMessage(null))
`

/**
 * Parses a file's metadata in a thread of its own, against the clock. The
 * XMP part of a file is text, read with patterns, and a file can be built
 * (megabytes of unclosed tags) that keeps such a reader busy for minutes.
 * Done here, on the thread that answers every visitor, that would stop the
 * whole site. In its own thread it stops nothing, and is ended after five
 * seconds with nothing read.
 */
function parseApart(path: string, options: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(READER, { eval: true, workerData: { path, options, reader: createRequire(import.meta.url).resolve('exifr') }, env: {}, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 256 } })
    }
    catch {
      resolve(null)
      return
    }
    worker.stdout.resume()
    worker.stderr.resume()
    let done = false
    const finish = (found: unknown) => {
      if (done) return
      done = true
      clearTimeout(timer)
      void worker.terminate().catch(() => undefined)
      resolve(found)
    }
    const timer = setTimeout(() => finish(null), TIME_LIMIT_MS)
    worker.once('message', finish)
    worker.once('error', () => finish(null))
    worker.once('exit', () => finish(null))
  })
}

/**
 * The words saved inside the file at `path`. A file with damaged metadata,
 * or none, or one that takes too long to read, has no words. With
 * `words: false` only the date is read, and the file's text is not opened.
 */
export async function readEmbeddedWords(path: string, { words = true }: { words?: boolean } = {}): Promise<EmbeddedWords> {
  try {
    const found = embeddedWords(await parseApart(path, words ? WORDS_OPTIONS : DATE_OPTIONS))
    return words ? found : { ...NO_WORDS, tags: [], takenAt: found.takenAt }
  }
  catch {
    return { ...NO_WORDS, tags: [] }
  }
}

/** File names a camera, a phone or a program gives: letters that say nothing, then numbers. */
const CAMERA_NAME = /^(img|image|dsc|dscf|dscn|dsc_|pict|pic|photo|picture|p|pxl|mvimg|gopr|dji|sam|cimg|scan|screenshot|untitled|wa|vid|file|foto|bild)?[\s\d()]*((wa|edit|hdr|copy)[\s\d()]*)*$/i

/**
 * Alt text for a photo that has none, so that no photo goes out without
 * any. It is a start for the owner to improve, not a description: nothing
 * here looks at the picture. The title if there is one; else the file's
 * name, when a person chose it; else "Photograph", with the day it was
 * taken when that is known.
 */
export function suggestAlt(photo: { title: string | null, filename: string, takenAt: number | null }): string {
  const title = line(photo.title, LIMITS.alt)
  if (title) return title
  const name = line(photo.filename.replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/[-_.]+/g, ' '), LIMITS.alt) ?? ''
  if ([...name.replace(/[\d\s()]/g, '')].length >= 3 && !CAMERA_NAME.test(name)) return name[0]!.toUpperCase() + name.slice(1)
  if (photo.takenAt === null) return 'Photograph'
  return `Photograph taken on ${new Date(photo.takenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
}

/**
 * Photos uploaded before version 1.11.0, or restored from a backup made
 * then, may have no alt text. Each is given a start, marked to be checked,
 * exactly as a new upload would be. Run at every start; it finds nothing to
 * do once it has run. Returns how many it filled in.
 */
export function fillMissingAlt(sqlite: PipelineContext['sqlite']): number {
  const missing = sqlite.prepare(`select id, title, original_filename as filename, taken_at as takenAt from photos where alt is null or trim(alt) = ''`).all() as { id: string, title: string | null, filename: string, takenAt: number | null }[]
  const fill = sqlite.prepare(`update photos set alt = ?, alt_auto = 1 where id = ?`)
  for (const photo of missing) fill.run(suggestAlt(photo), photo.id)
  return missing.length
}
