// Turns parsed EXIF into the columns shown on the site, and into a plain
// JSON copy kept for later use. The input comes from an uploaded file, so
// every value is checked before it is used.

export interface ExifColumns {
  camera: string | null
  lens: string | null
  focalLength: string | null
  aperture: string | null
  shutter: string | null
  iso: number | null
  takenAt: number | null
  lat: number | null
  lng: number | null
}

type Parsed = Record<string, unknown> | null | undefined

const TEXT_LIMIT = 120

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // Control characters have no business in a camera name.
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, TEXT_LIMIT)
  return clean || null
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Up to one decimal place, without a trailing ".0". */
const short = (value: number): string => String(Number(value.toFixed(1)))

function cameraName(make: string | null, model: string | null): string | null {
  if (!make || !model) return model ?? make
  // "Canon" + "Canon EOS R5", "NIKON CORPORATION" + "NIKON Z 6": the model already names the maker.
  const firstWord = make.split(/\s+/)[0]!.toLowerCase()
  return model.toLowerCase().startsWith(firstWord) ? model : `${make} ${model}`
}

function shutterSpeed(seconds: number | null): string | null {
  if (seconds === null) return null
  return seconds >= 1 ? `${short(seconds)} s` : `1/${Math.round(1 / seconds)} s`
}

/**
 * A camera writes the day and time on its own clock, with no time zone:
 * "2019:07:04 22:30:00". The reader turns that into a moment using the
 * server's time zone, so the same photo would be dated differently on two
 * servers, and an evening photo could land on the next day. This puts each
 * date back as the camera wrote it, held as if that clock read UTC, which is
 * how the site shows dates. Nothing else in the metadata is touched.
 */
export function datesAsWritten(parsed: Record<string, unknown>): Record<string, unknown> {
  const kept = { ...parsed }
  for (const key of ['DateTimeOriginal', 'CreateDate', 'ModifyDate']) {
    const date = kept[key]
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      kept[key] = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()))
    }
  }
  return kept
}

export function exifColumns(parsed: Parsed): ExifColumns {
  const exif = parsed ?? {}
  const focal = positive(exif.FocalLength)
  const fNumber = positive(exif.FNumber)
  const iso = positive(exif.ISO)
  // When the picture was taken; failing that, when it became a file (a scan, some phone apps).
  // Never when it was last edited, which says nothing about when it was taken.
  const taken = [exif.DateTimeOriginal, exif.CreateDate].find(date => date instanceof Date && !Number.isNaN(date.getTime())) as Date | undefined
  const lat = exif.latitude
  const lng = exif.longitude
  const located = typeof lat === 'number' && typeof lng === 'number'
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

  return {
    camera: cameraName(text(exif.Make), text(exif.Model)),
    lens: text(exif.LensModel),
    focalLength: focal === null ? null : `${short(focal)} mm`,
    aperture: fNumber === null ? null : `f/${short(fNumber)}`,
    shutter: shutterSpeed(positive(exif.ExposureTime)),
    iso: iso === null ? null : Math.round(iso),
    takenAt: taken ? taken.getTime() : null,
    lat: located ? lat : null,
    lng: located ? lng : null,
  }
}

const STORED_TEXT_LIMIT = 500
const STORED_LIST_LIMIT = 16

function storable(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, STORED_TEXT_LIMIT)
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  if (Array.isArray(value) && value.length <= STORED_LIST_LIMIT
    && value.every(item => typeof item === 'number' || typeof item === 'string')) {
    return value.map(storable)
  }
  return undefined // binary blobs (maker notes, embedded thumbnails) and nested objects
}

/** A plain-JSON copy of the EXIF, or null when there is none. */
export function exifForStorage(parsed: Parsed): Record<string, unknown> | null {
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed ?? {})) {
    const plain = storable(value)
    if (plain !== undefined) kept[key] = plain
  }
  return Object.keys(kept).length > 0 ? kept : null
}
