// Asks the first-run questions in the terminal and saves the answers to
// .env. Shared by `pnpm start` (which asks once, on the first start) and
// `pnpm fotobogen init` (which asks whenever it is run).
//
// What is asked, and when, is decided in server/core/first-run.ts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { config } from '../server/core/config.ts'
import { askFirstRun, envWith } from '../server/core/first-run.ts'
import { choosePort } from '../server/core/instances.ts'

/** True when someone is at the keyboard. FOTOBOGEN_ASSUME_TERMINAL exists for the test suite, which has no terminal. */
export const atTerminal = () => (process.stdin.isTTY === true && process.stdout.isTTY === true) || process.env.FOTOBOGEN_ASSUME_TERMINAL === '1'

/**
 * Asks, then writes the answers to the .env file at `envPath`, keeping
 * anything else that file already says. Returns the answers.
 */
export async function askAndSave(envPath, host = config.server.host) {
  // Lines are collected as they arrive and handed out one for each question,
  // so answers typed ahead (or piped in all at once) are not lost, and a
  // terminal that goes away part-way counts as Enter for the rest.
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const typed = []
  let waiting = null
  let closed = false
  prompt.on('line', (line) => {
    if (waiting) waiting(line)
    else typed.push(line)
  })
  prompt.once('close', () => {
    closed = true
    if (waiting) waiting('')
  })
  const question = async (text) => {
    process.stdout.write(text)
    if (typed.length > 0) return typed.shift()
    if (closed) return ''
    return await new Promise((answered) => {
      waiting = (line) => {
        waiting = null
        answered(line)
      }
    })
  }
  try {
    const answers = await askFirstRun({
      question,
      say: text => console.log(text),
      portIsFree: async port => !('error' in await choosePort(port, true, host, 1)),
    })
    writeFileSync(envPath, envWith(existsSync(envPath) ? readFileSync(envPath, 'utf8') : null, answers))
    return answers
  }
  finally {
    prompt.close()
  }
}

/** One line for each answer, to show what was understood. */
export function summary(answers) {
  return [
    `  Port:        ${answers.port ?? '5150, or the next free one'}`,
    `  Address:     ${answers.siteUrl ?? 'not set'}`,
    `  Demo mode:   ${answers.demoMode ? 'on' : 'off'}`,
  ].join('\n')
}
