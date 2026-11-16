// The questions asked in the terminal the first time Fotobogen is started:
// the things the server has to know before it can start, which is why they
// are not asked in the browser with the rest of setup.
//
// Asked once, and only when someone is at the keyboard. The answers are
// written to .env, where they can be changed by hand afterwards; `pnpm
// fotobogen init` asks again. Under pm2, Docker, or a script nothing is
// asked and the defaults are used, so a server never waits for an answer.
//
// Plain TypeScript with nothing from the web framework, so the launcher and
// the command-line tool share it and it can be tested without a terminal.

export interface FirstRunAnswers {
  /** The port to listen on. null: 5150, or the next free port above it. */
  port: number | null
  /** The site's public address. null: not set (it can be set in the admin). */
  siteUrl: string | null
  demoMode: boolean
}

type Env = Record<string, string | undefined>

/** Whether to ask. Only on a first start, at a terminal, with nothing decided yet. */
export function shouldAsk(situation: { interactive: boolean, envFileExists: boolean, databaseExists: boolean, env: Env }): boolean {
  const { env } = situation
  if (!situation.interactive || situation.envFileExists || situation.databaseExists) return false
  // Something else starts and restarts this copy; nobody would see the question.
  if (env.FOTOBOGEN_IN_DOCKER === '1' || env.pm_id !== undefined || env.CI !== undefined) return false
  if (env.FOTOBOGEN_NO_QUESTIONS === '1') return false
  return env.PORT === undefined && env.SITE_URL === undefined && env.DEMO_MODE === undefined
}

export interface Read<T> { value?: T, problem?: string }

export function readPort(answer: string): Read<number | null> {
  const text = answer.trim()
  if (text === '') return { value: null }
  if (!/^\d{1,5}$/.test(text)) return { problem: 'A port is a whole number, such as 5150.' }
  const port = Number(text)
  if (port < 1024 || port > 65535) return { problem: 'Choose a port from 1024 to 65535. Lower ones are kept for the system.' }
  return { value: port }
}

export function readSiteUrl(answer: string): Read<string | null> {
  const text = answer.trim()
  if (text === '') return { value: null }
  const problem = 'That is not a web address. It looks like https://photos.example.com'
  // One line of plain text and nothing else: it is written into a file of settings.
  if (!/^[\x21-\x7e]+$/.test(text)) return { problem }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
  if (hasScheme && !/^https?:\/\//i.test(text)) return { problem }
  try {
    const url = new URL(hasScheme ? text : `https://${text}`)
    if (url.hostname !== 'localhost' && !url.hostname.includes('.')) return { problem }
    return { value: url.origin }
  }
  catch {
    return { problem }
  }
}

export function readYesNo(answer: string): Read<boolean> {
  const text = answer.trim().toLowerCase()
  if (text === '' || text === 'n' || text === 'no') return { value: false }
  if (text === 'y' || text === 'yes') return { value: true }
  return { problem: 'Answer y for yes or n for no.' }
}

export interface AskIo {
  question: (text: string) => Promise<string>
  say: (text: string) => void
  /** Says that an answer could not be used. Left out, it is said like anything else. */
  warn?: (text: string) => void
  /** Whether a port can be used right now. Left out, the port is not tried. */
  portIsFree?: (port: number) => Promise<boolean>
}

/** Asks until an answer can be used. */
async function until<T>(io: AskIo, text: string, read: (answer: string) => Read<T> | Promise<Read<T>>): Promise<T> {
  for (;;) {
    const result = await read(await io.question(text))
    if (result.problem === undefined) return result.value as T
    ;(io.warn ?? io.say)(`  ${result.problem}`)
  }
}

/** Asks the three questions. Enter accepts the default each time. */
export async function askFirstRun(io: AskIo): Promise<FirstRunAnswers> {
  const port = await until(io, 'Port to run on? Press Enter for 5150, or the next free one above it: ', async (answer) => {
    const read = readPort(answer)
    if (read.value && io.portIsFree && !(await io.portIsFree(read.value))) return { problem: `Port ${read.value} is in use by something else. Choose another.` }
    return read
  })
  io.say('')
  io.say('Your site\'s address, if it has a domain name (https://photos.example.com).')
  io.say('It is used in links to your photos. You can set it later, in the admin.')
  const siteUrl = await until(io, 'Site address? Press Enter to skip: ', readSiteUrl)
  io.say('')
  io.say('Demo mode lets anyone log in as "demo" / "demo" and look round the admin')
  io.say('without being able to change anything. Only for a site that shows Fotobogen off.')
  const demoMode = await until(io, 'Switch demo mode on? [y/N] ', readYesNo)
  return { port, siteUrl, demoMode }
}

const HEADER = `# Settings for this server, written when Fotobogen was first started.
# Change them here and restart Fotobogen, or run: pnpm fotobogen init
# Everything is optional. .env.sample lists every setting there is.
`

interface Line { key: string, value: string | null, sample: string, about: string }

const lines = (answers: FirstRunAnswers): Line[] => [
  { key: 'PORT', value: answers.port === null ? null : String(answers.port), sample: '5150', about: '# The port Fotobogen listens on. Left unset: 5150, or the next free port above it.' },
  { key: 'SITE_URL', value: answers.siteUrl, sample: 'https://photos.example.com', about: '# The site\'s proper address, used in links to your photos.' },
  { key: 'DEMO_MODE', value: answers.demoMode ? '1' : null, sample: '1', about: '# Demo mode: anyone can log in as demo / demo and look, but not change anything.' },
]

/**
 * The text of .env with these answers in it. With no file yet, a new one
 * that explains itself. With one, only these three settings are changed:
 * a value is set on its own line, and a default comments that line out.
 */
export function envWith(existing: string | null, answers: FirstRunAnswers): string {
  if (existing === null) {
    return `${HEADER}\n${lines(answers).map(line => `${line.about}\n${line.value === null ? `# ${line.key}=${line.sample}` : `${line.key}=${line.value}`}\n`).join('\n')}`
  }
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const rows = existing.split(/\r?\n/)
  for (const line of lines(answers)) {
    const set = new RegExp(`^\\s*${line.key}=(.*)$`)
    const commented = new RegExp(`^\\s*#\\s*${line.key}=(.*)$`)
    // The line that is in force, if there is one; otherwise the commented-out one.
    let at = rows.findIndex(row => set.test(row))
    if (at === -1) at = rows.findIndex(row => commented.test(row))
    if (line.value !== null) {
      if (at === -1) {
        // Before the file's last, empty row, so it still ends with a line break.
        rows.splice(rows.at(-1) === '' ? rows.length - 1 : rows.length, 0, `${line.key}=${line.value}`)
      }
      else rows[at] = `${line.key}=${line.value}`
    }
    else if (at !== -1 && set.test(rows[at]!)) {
      rows[at] = `# ${line.key}=${rows[at]!.match(set)![1]}`
    }
  }
  return rows.join(eol)
}
