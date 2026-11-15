#!/usr/bin/env node
// Fotobogen's command-line tool. Run it on the server, from the app's
// directory, with the same DATA_DIR the app uses:
//
//   pnpm fotobogen reset-admin
//   pnpm seed:fetch                 (development: download the sample photos)
//   docker compose exec app node scripts/fotobogen.mjs reset-admin
//
// It works on the data directory directly and does not need the app running.
// Node 24 runs the TypeScript files it imports without a build step.
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import Database from 'better-sqlite3'
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../server/core/password.ts'
import { dataPaths, resolveDataDir } from '../server/core/paths.ts'

const USAGE = `Usage: fotobogen <command>

Commands:
  reset-admin [--username <name>]   Set a new admin password and sign out all sessions
  preflight                         Check that this machine can run Fotobogen
  backup [file]                     Write a backup zip (default: fotobogen-backup-<date>.zip)
  restore <file>                    Replace this site's data with a backup. Stop Fotobogen first
  module new <name>                 Start a new module in data/modules/<name>
  module test <name or folder>      Try a module on a test picture (or --image <file>) and
                                    write the results to ./module-test (or --out <dir>)
  seed-fetch                        Download the 25 sample photos into the library
                                    (needs a source checkout; in a running site,
                                    use Admin > Download sample photos instead)

The data directory is read from DATA_DIR (default: ./data).`

class CliError extends Error {}

/** Ask for a line without echoing what is typed. */
function askHidden(question) {
  return new Promise((resolve) => {
    let muted = false
    const output = new Writable({
      write(chunk, _encoding, done) {
        if (!muted) process.stdout.write(chunk)
        done()
      },
    })
    const rl = createInterface({ input: process.stdin, output, terminal: true })
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    muted = true
  })
}

/** Read one line from piped input (used by scripts and tests). */
async function readPipedLine() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return text.split(/\r?\n/)[0] ?? ''
}

async function askForNewPassword() {
  if (!process.stdin.isTTY) return readPipedLine()
  const first = await askHidden('New password: ')
  const second = await askHidden('Repeat it: ')
  if (first !== second) throw new CliError('The two passwords did not match. Nothing was changed.')
  return first
}

async function resetAdmin(args) {
  const flag = args.indexOf('--username')
  const wanted = flag >= 0 ? args[flag + 1] : undefined
  if (flag >= 0 && !wanted) throw new CliError('--username needs a name.')

  const paths = dataPaths(resolveDataDir(process.env, process.cwd()))
  if (!existsSync(paths.db)) {
    throw new CliError(`No Fotobogen database found at ${paths.db}. Check DATA_DIR.`)
  }
  const db = new Database(paths.db, { fileMustExist: true })
  db.pragma('busy_timeout = 5000')
  try {
    const admins = db.prepare(`select id, username from users order by created_at`).all()
    if (admins.length === 0) {
      throw new CliError('There is no admin account yet. Finish setup in the browser first.')
    }
    const user = wanted ? admins.find(row => row.username === wanted) : admins[0]
    if (!user) throw new CliError(`No user named "${wanted}".`)

    const password = await askForNewPassword()
    if ([...password].length < PASSWORD_MIN_LENGTH) {
      throw new CliError(`Use at least ${PASSWORD_MIN_LENGTH} characters. Nothing was changed.`)
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw new CliError(`Use ${PASSWORD_MAX_LENGTH} characters or fewer. Nothing was changed.`)
    }

    // Bumping session_version signs out every existing session.
    db.prepare(`update users set password_hash = ?, session_version = session_version + 1 where id = ?`)
      .run(await hashPassword(password), user.id)
    console.log(`Password updated for ${user.username}. All sessions were signed out.`)
  }
  finally {
    db.close()
  }
}

/**
 * Downloads the sample photos and processes them here, in this process. The
 * image code is loaded only for this command, so the other commands keep
 * working where it is not installed (the Docker image).
 */
async function seedFetch() {
  const paths = dataPaths(resolveDataDir(process.env, process.cwd()))
  if (!existsSync(paths.db)) {
    throw new CliError(`No Fotobogen database found at ${paths.db}. Start the app once first, or check DATA_DIR.`)
  }
  const { mkdirSync } = await import('node:fs')
  const { createLocalStorage } = await import('../server/storage/local.ts')
  const { readLimits } = await import('../server/pipeline/limits.ts')
  const { createQueue } = await import('../server/pipeline/queue.ts')
  const { fetchSamples, readManifest, PICSUM } = await import('../server/pipeline/samples.ts')

  mkdirSync(paths.tmp, { recursive: true })
  const sqlite = new Database(paths.db, { fileMustExist: true })
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('foreign_keys = ON')
  try {
    const ctx = {
      sqlite,
      storage: createLocalStorage({ originals: paths.originals, derivatives: paths.derivatives }),
      limits: readLimits(process.env),
      tmpDir: paths.tmp,
    }
    const entries = readManifest()
    const result = await fetchSamples(ctx, entries, {
      baseUrl: process.env.SAMPLES_BASE_URL || PICSUM,
      onProgress: progress => console.log(`${progress.added + progress.skipped + progress.failed.length} of ${entries.length}`),
    })
    const queue = createQueue(ctx, { onError: (job, error) => console.error(`Photo ${job.photoId}: ${error.message}`) })
    queue.kick()
    await queue.idle()
    console.log(`Sample photos: ${result.added} added, ${result.skipped} already there, ${result.failed.length} failed.`)
    if (result.failed.length > 0) {
      throw new CliError('Some sample photos could not be downloaded. Lorem Picsum may be unreachable; run the command again later.')
    }
  }
  finally {
    sqlite.close()
  }
}

const KNOWN_MIGRATIONS = async () => {
  const { readMigrationsFromDir } = await import('../server/core/migrate.ts')
  const { fileURLToPath } = await import('node:url')
  return readMigrationsFromDir(fileURLToPath(new URL('../server/db/migrations', import.meta.url))).map(migration => migration.name)
}

/** Writes a backup zip of the site. The app may be running. */
async function backup(args) {
  const { createWriteStream, readFileSync } = await import('node:fs')
  const { writeBackup } = await import('../server/core/backup.ts')
  const paths = dataPaths(resolveDataDir(process.env, process.cwd()))
  if (!existsSync(paths.db)) throw new CliError(`No Fotobogen database found at ${paths.db}. Check DATA_DIR.`)
  const file = args[0] ?? `fotobogen-backup-${new Date().toISOString().slice(0, 10)}.zip`
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const db = new Database(paths.db, { fileMustExist: true })
  db.pragma('busy_timeout = 5000')
  try {
    const manifest = await writeBackup(db, paths, version, createWriteStream(file))
    console.log(`Backup written to ${file}: ${manifest.photos} photos, ${(manifest.originalsBytes / 1024 / 1024).toFixed(1)} MB of uploaded files.`)
  }
  finally {
    db.close()
  }
}

/** Replaces the site's data with a backup. The app must be stopped. */
async function restore(args) {
  const file = args[0]
  if (!file) throw new CliError('Say which backup to restore: fotobogen restore backup.zip')
  if (!existsSync(file)) throw new CliError(`There is no file at ${file}.`)
  const { applyRestore, inspectBackup } = await import('../server/core/backup.ts')
  const { runningInstances } = await import('../server/core/instances.ts')
  const { resolve } = await import('node:path')
  const { mkdirSync } = await import('node:fs')
  const paths = dataPaths(resolveDataDir(process.env, process.cwd()))
  const running = runningInstances().find(instance => resolve(instance.dataDir) === resolve(paths.root))
  if (running) throw new CliError(`Fotobogen is running with this data directory (port ${running.port}). Stop it, then restore.`)
  const inspected = await inspectBackup(file, await KNOWN_MIGRATIONS())
  if (!inspected.ok) throw new CliError(inspected.message)
  mkdirSync(paths.root, { recursive: true })
  const result = await applyRestore(paths, file)
  console.log(`Restored ${result.photos} photos from a backup made ${inspected.manifest.createdAt.slice(0, 10)}.`)
  console.log(`What was here before is kept in ${result.keptIn}.`)
  console.log('Start Fotobogen; it will make the resized copies again.')
}

const option = (args, name) => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

/** `module new` and `module test`, for people writing modules. Needs a source checkout. */
async function moduleTools(args) {
  const [action, target] = args
  const { existsSync: exists } = await import('node:fs')
  const { join } = await import('node:path')
  const { scaffoldModule, testModule } = await import('../server/modules/devtools.ts')
  const paths = dataPaths(resolveDataDir(process.env, process.cwd()))
  if (action === 'new') {
    if (!target) throw new CliError('Give the module a name: fotobogen module new my-module')
    try {
      const folder = scaffoldModule(paths.modules, target)
      console.log(`Created ${folder}`)
      console.log(`Edit index.mjs there, then try it:  pnpm fotobogen module test ${target}`)
    }
    catch (error) {
      throw new CliError(error.message)
    }
  }
  else if (action === 'test') {
    if (!target) throw new CliError('Say which module: fotobogen module test my-module')
    // A name means the one in data/modules; anything else is taken as a folder.
    const folder = exists(join(paths.modules, target, 'module.json')) ? join(paths.modules, target) : target
    if (!exists(join(folder, 'module.json'))) throw new CliError(`There is no module at ${folder} (no module.json there).`)
    const result = await testModule(folder, { image: option(args, '--image'), outDir: option(args, '--out') ?? 'module-test' })
    for (const line of result.lines) console.log(`${line.ok ? '  ok  ' : ' FAIL '} ${line.text}`)
    if (result.written.length > 0) console.log(`\nLook at the results:\n${result.written.map(file => `  ${file}`).join('\n')}`)
    if (!result.ok) throw new CliError('\nThe module is not ready. Fix what is marked FAIL above.')
    console.log('\nThe module works. Copy its folder into data/modules/ on a site and restart to install it.')
  }
  else {
    throw new CliError('Use "fotobogen module new <name>" or "fotobogen module test <name or folder>".')
  }
}

/** The same check the server runs before it starts, with every line shown. */
async function preflight() {
  const { existsSync: exists } = await import('node:fs')
  if (exists('.env')) process.loadEnvFile('.env')
  const { evaluate, formatReport, gatherFacts, passed } = await import('../server/core/preflight.ts')
  const checks = evaluate(await gatherFacts(resolveDataDir(process.env, process.cwd())))
  console.log(`Fotobogen preflight check\n${formatReport(checks, true)}`)
  if (!passed(checks)) throw new CliError('\nThis machine is not ready to run Fotobogen. Fix what is marked FAIL above.')
  console.log('\nThis machine can run Fotobogen.')
}

const [command, ...args] = process.argv.slice(2)
try {
  if (command === 'reset-admin') {
    await resetAdmin(args)
  }
  else if (command === 'seed-fetch') {
    await seedFetch()
  }
  else if (command === 'preflight') {
    await preflight()
  }
  else if (command === 'module') {
    await moduleTools(args)
  }
  else if (command === 'backup') {
    await backup(args)
  }
  else if (command === 'restore') {
    await restore(args)
  }
  else if (command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE)
  }
  else {
    console.error(command ? `Unknown command: ${command}\n\n${USAGE}` : USAGE)
    process.exitCode = 1
  }
}
catch (error) {
  if (!(error instanceof CliError)) throw error
  console.error(error.message)
  process.exitCode = 1
}
