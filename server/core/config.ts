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
  maxUploadMb: number
  maxMegapixels: number
}

/** The settings in force: environment first, then fotobogen.config.js. */
export function resolveSettings(env: Env): Settings {
  const port = positive(env.PORT)
  return {
    port: port !== undefined && Number.isInteger(port) && port < 65536 ? port : config.server.port,
    portIsExplicit: port !== undefined && Number.isInteger(port) && port < 65536,
    host: env.HOST?.trim() || config.server.host,
    dataDir: env.DATA_DIR?.trim() || config.dataDir,
    trustProxy: env.TRUST_PROXY !== undefined ? env.TRUST_PROXY === '1' : config.server.trustProxy,
    maxUploadMb: positive(env.MAX_UPLOAD_MB) ?? config.uploads.maxUploadMb,
    maxMegapixels: positive(env.MAX_MEGAPIXELS) ?? config.uploads.maxMegapixels,
  }
}
