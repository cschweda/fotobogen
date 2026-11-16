#!/usr/bin/env node
// Starts Fotobogen. This is what `pnpm start`, the Docker image, and pm2 run.
//
//   1. Reads .env, if there is one (real environment variables win over it).
//   2. Runs the preflight check and stops if the machine is not up to it.
//   3. The very first time, at a terminal, asks a few questions (the port,
//      the site's address, demo mode) and saves the answers to .env.
//   4. Looks for copies of Fotobogen already running, and decides with you
//      whether to run beside them or in their place.
//   5. Picks the port: the one you set, or 5150, or the next free one above.
//   6. Starts the server.
//
// Node 24 runs the TypeScript files this imports without a build step.
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config, resolveSettings } from '../server/core/config.ts'
import { choosePort, planStart, registerInstance, runningInstances, stopInstance } from '../server/core/instances.ts'
import { dataPaths, resolveDataDir } from '../server/core/paths.ts'
import { shouldAsk } from '../server/core/first-run.ts'
import { evaluate, formatReport, gatherFacts, passed } from '../server/core/preflight.ts'
import { askAndSave, atTerminal, paint, summary } from './questions.mjs'

// Green for good, yellow for a warning, red for what stops the start. Only at a terminal; logs stay plain.
const stop = (message) => {
  console.error(`\n${paint.red(message)}\n`)
  process.exit(1)
}

// 1. Settings: environment, then .env, then fotobogen.config.js.
if (existsSync('.env')) process.loadEnvFile('.env')
let settings = resolveSettings(process.env)
const dataDir = resolveDataDir(process.env, process.cwd())

const entry = fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url))
if (!existsSync(entry)) stop('Fotobogen has not been built yet. Run `pnpm build`, then start it again.')

// 2. Preflight. The full report is shown the first time; after that, only problems.
if (process.env.FOTOBOGEN_SKIP_PREFLIGHT !== '1') {
  const firstRun = !existsSync(dataPaths(dataDir).db)
  const checks = evaluate(await gatherFacts(dataDir))
  const report = formatReport(checks, firstRun, paint)
  if (report) console.log(`\n${paint.bold('Fotobogen preflight check')}\n${report}`)
  if (firstRun && passed(checks)) {
    console.log(checks.some(check => check.level === 'warn')
      ? paint.yellow('\nThis machine can run Fotobogen. See what is marked WARN above.')
      : paint.green('\nAll checks passed. This machine can run Fotobogen.'))
  }
  if (!passed(checks)) {
    stop('Fotobogen did not start. Fix what is marked FAIL above and start it again.\n(To start anyway, at your own risk, set FOTOBOGEN_SKIP_PREFLIGHT=1.)')
  }
}

// 3. The first-run questions. Never asked when nobody is at the keyboard (pm2, Docker, a script).
if (shouldAsk({ interactive: atTerminal(), envFileExists: existsSync('.env'), databaseExists: existsSync(dataPaths(dataDir).db), env: process.env })) {
  console.log(`\n${paint.bold('A few questions before the first start.')} Press Enter to accept what is suggested.\n`)
  const answers = await askAndSave('.env', settings.host)
  process.loadEnvFile('.env')
  settings = resolveSettings(process.env)
  console.log(`\n${paint.green('Saved to .env:')}\n${summary(answers)}\nTo change them, edit .env or run: pnpm fotobogen init`)
}

// 4. Copies already running on this machine.
const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true
const plan = planStart(runningInstances(), dataDir, interactive)
if (plan.action === 'refuse') stop(plan.message)
if (plan.action === 'ask') {
  const describe = instance => `  port ${instance.port}, data in ${instance.dataDir} (process ${instance.pid})`
  const all = [...plan.sameData, ...plan.others]
  console.log(`\nFotobogen is already running on this computer:\n${all.map(describe).join('\n')}\n`)
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  let answer = ''
  if (plan.sameData.length > 0) {
    // Two copies must not share one data directory, so "both" is not offered.
    console.log('One of them uses the same data directory as this one. Two copies cannot share a data directory.')
    while (!['s', 'c'].includes(answer)) {
      answer = (await prompt.question('[S]top the running copy and start this one, or [C]ancel? ')).trim().toLowerCase().slice(0, 1)
    }
  }
  else {
    while (!['b', 's', 'c'].includes(answer)) {
      answer = (await prompt.question('Run [B]oth (this one gets its own port), [S]top the running copy and start this one, or [C]ancel? ')).trim().toLowerCase().slice(0, 1)
    }
  }
  prompt.close()
  if (answer === 'c') {
    console.log('Nothing was started.')
    process.exit(0)
  }
  if (answer === 's') {
    for (const instance of all) {
      if (!(await stopInstance(instance))) stop(`The copy on port ${instance.port} (process ${instance.pid}) did not stop. Stop it yourself, then start this one again.`)
      console.log(`Stopped the copy on port ${instance.port}.`)
    }
  }
}

// 5. The port.
const choice = await choosePort(settings.port, settings.portIsExplicit, settings.host, config.server.portAttempts)
if ('error' in choice) stop(choice.error)
if (choice.moved) console.log(paint.yellow(`\nPort ${settings.port} is in use, so Fotobogen is using port ${choice.port}.`))
process.env.PORT = String(choice.port)
process.env.HOST = settings.host
process.env.DATA_DIR = dataDir

// 6. Start, and leave a note that this copy is running.
const unregister = registerInstance({ port: choice.port, dataDir: resolve(dataDir) })
process.on('exit', unregister)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0))

// A file URL, not a path: Windows paths are not valid import specifiers.
await import(pathToFileURL(entry).href)
console.log(`\n${paint.green('Fotobogen is running.')} Open it in a browser on this computer:\n\n    ${paint.bold(`http://localhost:${choice.port}`)}\n\nLogging in works at that address, or over https.`)
