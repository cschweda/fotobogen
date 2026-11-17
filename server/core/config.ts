// Reads fotobogen.config.js and applies the environment on top of it.
// Everything that needs an app-wide value gets it from here, so the config
// file stays the single place those values are written down.
import fileConfig from '../../fotobogen.config.js'

export const config = fileConfig

type Env = Record<string, string | undefined>

function positive(value: string | undefined): number | undefined {
  const number = Number(value)
  return value !== undefined && value.trim() !== '' && Number.isFinite(number) && number > 0 ? number : undefined
}

export interface Settings {
  port: number
  /** True when the port came from the environment or .env rather than the default. */
  portIsExplicit: boolean
  host: string
  dataDir: string
  trustProxy: boolean
  /** Whether anyone may log in as demo / demo and look round the admin, read-only. */
  demoMode: boolean
  /** The site's proper address (an origin such as https://photos.example.com), or '' when none is set here. */
  siteUrl: string
  /** The admin's own name (admin.photos.example.com), or '' when the admin lives at the site's address. See core/hosts.ts. */
  adminHost: string
  maxUploadMb: number
  maxMegapixels: number
  /** Whether webhooks may call private and loopback addresses. */
  webhooksAllowPrivate: boolean
}

/** The settings in force: environment first, then fotobogen.config.js. */
/** An address reduced to its origin; anything that is not an http(s) address counts as not set. */
function siteAddress(given: string): string {
  try {
    const url = new URL(given)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : ''
  }
  catch {
    return ''
  }
}

export function resolveSettings(env: Env): Settings {
  const port = positive(env.PORT)
  return {
    port: port !== undefined && Number.isInteger(port) && port < 65536 ? port : config.server.port,
    portIsExplicit: port !== undefined && Number.isInteger(port) && port < 65536,
    host: env.HOST?.trim() || config.server.host,
    dataDir: env.DATA_DIR?.trim() || config.dataDir,
    trustProxy: env.TRUST_PROXY !== undefined ? env.TRUST_PROXY === '1' : config.server.trustProxy,
    demoMode: env.DEMO_MODE !== undefined ? env.DEMO_MODE === '1' : config.server.demoMode === true,
    siteUrl: siteAddress(env.SITE_URL?.trim() || config.server.siteUrl || ''),
    adminHost: env.ADMIN_HOST?.trim().toLowerCase() ?? '',
    maxUploadMb: positive(env.MAX_UPLOAD_MB) ?? config.uploads.maxUploadMb,
    maxMegapixels: positive(env.MAX_MEGAPIXELS) ?? config.uploads.maxMegapixels,
    webhooksAllowPrivate: env.WEBHOOKS_ALLOW_PRIVATE !== undefined ? env.WEBHOOKS_ALLOW_PRIVATE === '1' : config.webhooks.allowPrivate,
  }
}
