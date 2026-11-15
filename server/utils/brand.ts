// The site's icon and logo: pictures the owner uploads to make the site
// theirs. They are small, so they are kept in the database beside the other
// settings. That puts them in every backup with nothing extra to copy.
import { createHash } from 'node:crypto'
import sharp from '../pipeline/image.ts'
import { sniffFormat } from '../pipeline/accept.ts'
import { getSetting, setSettings } from './settings.ts'

/** The largest file accepted for an icon or logo. */
export const BRAND_MAX_BYTES = 5 * 1024 * 1024
/** Icon sizes made: the browser tab, an iPhone's home screen, and Android's. */
export const ICON_SIZES = [32, 180, 192] as const
/** A logo is stored at up to this height, twice the tallest it can be shown, so it stays sharp on dense screens. */
const LOGO_STORED_HEIGHT = 240
export const LOGO_HEIGHT = { min: 20, max: 120, default: 40 }

export type BrandKind = 'icon' | 'logo-light' | 'logo-dark'
export const BRAND_KINDS: BrandKind[] = ['icon', 'logo-light', 'logo-dark']

interface LogoMeta { width: number, height: number }
export interface BrandMeta {
  /** Changes whenever a picture does, so browsers fetch the new one. */
  version: string
  icon: boolean
  logo: { light: LogoMeta | null, dark: LogoMeta | null }
  /** How tall the logo is shown, in pixels. */
  logoHeight: number
}

const META_KEY = 'brand.meta'
const FILES_KEY = 'brand.files'
const EMPTY: BrandMeta = { version: '', icon: false, logo: { light: null, dark: null }, logoHeight: LOGO_HEIGHT.default }

export function brandMeta(): BrandMeta {
  const saved = getSetting<Partial<BrandMeta>>(META_KEY, {})
  return { ...EMPTY, ...saved, logo: { ...EMPTY.logo, ...saved.logo } }
}
/** The stored pictures, by file name, as base64. */
const files = (): Record<string, string> => getSetting<Record<string, string>>(FILES_KEY, {})

function save(meta: BrandMeta, stored: Record<string, string>) {
  // The version is a hash of everything stored, so it changes exactly when a picture does.
  const version = createHash('sha256').update(JSON.stringify(Object.entries(stored).sort())).digest('hex').slice(0, 10)
  setSettings({ [META_KEY]: { ...meta, version }, [FILES_KEY]: stored })
}

export class BrandError extends Error {}

/**
 * Checks an uploaded picture and stores the copies made from it.
 * The upload is judged by its contents: JPEG, PNG, or WebP. (SVG is refused:
 * an SVG file can carry scripts.) It is decoded and written out afresh, so
 * nothing but pixels is kept.
 */
export async function storeBrandImage(kind: BrandKind, bytes: Buffer): Promise<BrandMeta> {
  if (bytes.length > BRAND_MAX_BYTES) throw new BrandError('That file is larger than 5 MB. An icon or logo should be far smaller; save a smaller copy and try again.')
  const format = sniffFormat(bytes.subarray(0, 32))
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') throw new BrandError('Use a PNG, JPEG, or WebP picture. (SVG files are not accepted.)')

  let size: { width?: number, height?: number }
  // A small file can claim to be an enormous picture; 40 megapixels is far more than an icon or logo needs.
  const open = () => sharp(bytes, { limitInputPixels: 40_000_000 }).rotate()
  try {
    size = await open().metadata()
  }
  catch {
    throw new BrandError('That picture could not be read. It may be damaged, or too large in pixels.')
  }
  const width = size.width ?? 0
  const height = size.height ?? 0
  const meta = brandMeta()
  const stored = { ...files() }

  try {
    if (kind === 'icon') {
      if (width < 64 || height < 64) throw new BrandError('An icon needs to be at least 64 pixels on each side. 512 by 512 is a good size.')
      for (const edge of ICON_SIZES) {
        // A picture that is not square is cropped to its middle.
        stored[`icon-${edge}.png`] = (await open().resize(edge, edge, { fit: 'cover' }).png().toBuffer()).toString('base64')
      }
      meta.icon = true
    }
    else {
      if (height < 16 || width < 16) throw new BrandError('That picture is too small to use as a logo. Make it at least 80 pixels tall.')
      const mode = kind === 'logo-light' ? 'light' : 'dark'
      const { data, info } = await open().resize({ height: LOGO_STORED_HEIGHT, width: LOGO_STORED_HEIGHT * 8, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
      stored[`logo-${mode}.png`] = data.toString('base64')
      meta.logo[mode] = { width: info.width, height: info.height }
    }
  }
  catch (error) {
    if (error instanceof BrandError) throw error
    throw new BrandError('That picture could not be read. It may be damaged.')
  }
  save(meta, stored)
  return brandMeta()
}

export function removeBrandImage(kind: BrandKind): BrandMeta {
  const meta = brandMeta()
  const stored = { ...files() }
  if (kind === 'icon') {
    for (const edge of ICON_SIZES) delete stored[`icon-${edge}.png`]
    meta.icon = false
  }
  else {
    const mode = kind === 'logo-light' ? 'light' : 'dark'
    delete stored[`logo-${mode}.png`]
    meta.logo[mode] = null
  }
  save(meta, stored)
  return brandMeta()
}

export function setLogoHeight(given: unknown): BrandMeta {
  const height = typeof given === 'number' && Number.isFinite(given) ? Math.round(Math.min(LOGO_HEIGHT.max, Math.max(LOGO_HEIGHT.min, given))) : LOGO_HEIGHT.default
  save({ ...brandMeta(), logoHeight: height }, files())
  return brandMeta()
}

/** One stored picture, or null. Only the names this file writes can be asked for. */
export function brandFile(name: string): Buffer | null {
  if (!/^(icon-(32|180|192)|logo-(light|dark))\.png$/.test(name)) return null
  const data = files()[name]
  return data ? Buffer.from(data, 'base64') : null
}

/** What the public pages need: where the icon and logo are, and how large to show the logo. */
export function publicBrand() {
  const meta = brandMeta()
  const address = (name: string) => `/brand/${name}?v=${meta.version}`
  const logo = (mode: 'light' | 'dark') => {
    // One logo serves both modes until a second is given.
    const used = meta.logo[mode] ? mode : meta.logo.light ? 'light' : meta.logo.dark ? 'dark' : null
    if (!used) return null
    const stored = meta.logo[used]!
    const height = Math.min(meta.logoHeight, stored.height)
    return { url: address(`logo-${used}.png`), width: Math.round(stored.width * height / stored.height), height }
  }
  return {
    icon: meta.icon ? { small: address('icon-32.png'), touch: address('icon-180.png'), large: address('icon-192.png') } : null,
    logo: meta.logo.light || meta.logo.dark ? { light: logo('light')!, dark: logo('dark')! } : null,
  }
}
