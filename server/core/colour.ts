// Colour for what Fotobogen prints in a terminal: green for good, yellow
// for a warning, red for something that stops it.
//
// Colour is only ever added to words that already say the same thing ("ok",
// "WARN", "FAIL"), so nothing is lost where it is not shown: in a log file,
// under pm2 or Docker, through a pipe, or for someone who cannot tell the
// colours apart.

type Env = Record<string, string | undefined>

/**
 * Whether to use colour. At a terminal, yes. Not when the output goes
 * anywhere else, so logs stay plain text. NO_COLOR (https://no-color.org)
 * switches it off; FORCE_COLOR switches it on, or off with "0".
 */
export function colourWanted(env: Env, isTerminal: boolean): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') return env.FORCE_COLOR !== '0'
  if (env.TERM === 'dumb') return false
  return isTerminal
}

export interface Painter {
  green: (text: string) => string
  yellow: (text: string) => string
  red: (text: string) => string
  dim: (text: string) => string
  bold: (text: string) => string
}

const wrap = (open: number, close: number) => (text: string) => `\u001B[${open}m${text}\u001B[${close}m`
const same = (text: string) => text

/** The colours, or with `on` false, functions that leave text as it is. */
export function painter(on: boolean): Painter {
  if (!on) return { green: same, yellow: same, red: same, dim: same, bold: same }
  return { green: wrap(32, 39), yellow: wrap(33, 39), red: wrap(31, 39), dim: wrap(2, 22), bold: wrap(1, 22) }
}
