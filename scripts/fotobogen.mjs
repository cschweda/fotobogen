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
  two-step off [--username <name>]  Switch two-step login off, for an owner who has lost both
                                    the phone and the backup codes. The password still applies.
  two-step key                      Show this server's two-step login key, to add to a new phone
  preflight                         Check that this machine can run Fotobogen
  init                              Ask for the port, the site's address, and demo mode,
                                    and save the answers to .env. Restart afterwards.
  backup [file]                     Write a backup zip (default: fotobogen-backup-<date>.zip)
  restore <file>                    Replace this site's data with a backup. Stop Fotobogen first
  update [version]                  Install the latest release (or the one named) over this
                                    copy, for an install made with git. Restart afterwards.
  module new <name>                 Start a new module in data/modules/<name>
  module test <name or folder>      Try a module on a test picture (or --image <file>) and
                                    write the results to ./module-test (or --out <dir>)
  import <folder>                   Bring a folder of photos into the running site. Add
                                    --albums to make an album of each folder inside it,
                                    or --album <name> to put them all in one
  seed-fetch                        Download the 25 sample photos into the library
                                    (needs a source checkout; in a running site,
                                    use Admin > Download sample photos instead)

The data directory is read from DATA_DIR (default: ./data).`

class CliError extends Error {}

/** Asks the first-run questions again and saves the answers, keeping the rest of .env as it is. */
async function init() {
  const { askAndSave, atTerminal, summary } = await import('./questions.mjs')
  if (!atTerminal()) throw new CliError('`fotobogen init` asks questions, so it needs a terminal. Without one, set PORT, SITE_URL, and DEMO_MODE in .env by hand; .env.sample explains each.')
  console.log(`\nSettings for this server. Press Enter to accept what is suggested.\n${existsSync('.env') ? 'Your other settings in .env are kept.\n' : ''}`)
  const answers = await askAndSave('.env')
  const { paint } = await import('./questions.mjs')
  console.log(`\n${paint.green('Saved to .env:')}\n${summary(answers)}\nRestart Fotobogen for this to take effect.`)
}

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
  // Never write through a link to some other file.
  const { lstatSync } = await import('node:fs')
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new CliError(`${file} is a link to another file. Give the backup a name of its own.`)
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const db = new Database(paths.db, { fileMustExist: true })
  db.pragma('busy_timeout = 5000')
  try {
    // It holds every photo and the login's password hash: readable by this user only.
    const manifest = await writeBackup(db, paths, version, createWriteStream(file, { mode: 0o600 }))
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
  const { applyRestore, inspectBackup, TWO_STEP_UNKNOWN } = await import('../server/core/backup.ts')
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
  if (result.twoStep === 'unknown') console.warn(`WARNING: ${TWO_STEP_UNKNOWN}`)
  console.log('Start Fotobogen; it will make the resized copies again.')
}

const option = (args, name) => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

/** `module new` and `module test`, for people writing modules. Needs a source checkout. */
async function moduleTools(args) {
  const [action, target] = args
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
  const { evaluate, formatReport, gatherFacts, passed } = await import('../server/core/preflight.ts')
  const { paint } = await import('./questions.mjs')
  const checks = evaluate(await gatherFacts(resolveDataDir(process.env, process.cwd())))
  console.log(`${paint.bold('Fotobogen preflight check')}\n${formatReport(checks, true, paint)}`)
  if (!passed(checks)) throw new CliError('\nThis machine is not ready to run Fotobogen. Fix what is marked FAIL above.')
  console.log(checks.some(check => check.level === 'warn')
    ? paint.yellow('\nThis machine can run Fotobogen. See what is marked WARN above.')
    : paint.green('\nThis machine can run Fotobogen.'))
}

/** Installs a released version over this copy. Fotobogen may be running; restart it afterwards. */
async function update(args) {
  const { updateSupport } = await import('../server/core/updater.ts')
  const { parseVersion, isNewer } = await import('../server/core/version.ts')
  const { readFileSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const root = fileURLToPath(new URL('..', import.meta.url))
  const support = await updateSupport(root, process.env)
  if (support.method !== 'source') throw new CliError(support.reason ?? 'This copy cannot update itself.')
  const current = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  let version = args[0]?.replace(/^v/, '')
  if (!version) {
    // Asks GitHub which release is the latest. Nothing about this site is sent.
    const response = await fetch(process.env.UPDATES_URL || 'https://api.github.com/repos/cschweda/fotobogen/releases/latest', { headers: { 'accept': 'application/vnd.github+json', 'user-agent': 'fotobogen-update-check' }, signal: AbortSignal.timeout(10_000) }).catch(() => null)
    if (!response) throw new CliError('GitHub could not be reached from this server.')
    if (response.status === 404) throw new CliError('No release of Fotobogen has been published yet.')
    if (!response.ok) throw new CliError(`GitHub could not be asked just now (it answered ${response.status}).`)
    version = parseVersion((await response.json()).tag_name)?.join('.')
    if (!version) throw new CliError('The latest release has a version this copy does not recognise.')
  }
  if (!parseVersion(version)) throw new CliError(`"${version}" is not a version number. Use three numbers, such as 1.2.0.`)
  if (!isNewer(version, current)) {
    console.log(`This copy is version ${current}, and ${version === current ? 'that is the latest' : `version ${version} is not newer`}. Nothing to do.`)
    return
  }
  console.log(`Updating from version ${current} to ${version}. This takes a few minutes.\n`)
  const ran = spawnSync(process.execPath, [fileURLToPath(new URL('./update.mjs', import.meta.url)), version], { stdio: 'inherit' })
  if (ran.status !== 0) throw new CliError('')
  console.log('Restart Fotobogen to start using it: stop it and run "pnpm start", or "pm2 restart fotobogen".')
}

/** Two-step login from the server itself: the way back in when the phone and the backup codes are both gone. */
async function twoStep(args) {
  const paths = dataPaths(resolveDataDir(process.env, process.cwd()))
  if (args[0] === 'key') {
    const { homedir, hostname } = await import('node:os')
    const { keyFileFor, loadServerKey } = await import('../server/core/two-step-key.ts')
    const { otpauthUri } = await import('../server/core/totp.ts')
    const file = keyFileFor(process.env, homedir(), paths.root)
    if (!process.env.TWO_STEP_KEY?.trim() && !existsSync(file)) {
      throw new CliError(`This server has no two-step login key yet (looked in ${file}). One is made the first time two-step login is set up under Admin, Two-step login.`)
    }
    const { key, fromSetting } = loadServerKey(file, process.env)
    console.log(`Two-step login key for Fotobogen on this server${fromSetting ? ' (from TWO_STEP_KEY)' : `, kept in ${file}`}:\n`)
    console.log(`  ${key.replace(/(.{4})(?=.)/g, '$1 ')}\n`)
    console.log('In your authenticator app, add an entry and choose to type a key ("Enter a setup key" in Google Authenticator). Give it this key; the kind is "time based".')
    console.log(`\nAs an address, for apps that take one: ${otpauthUri(key, hostname())}`)
    console.log('\nAnyone who has this key and your password can log in. Do not paste it anywhere.')
    return
  }
  if (args[0] !== 'off') throw new CliError('Say which: "fotobogen two-step off" or "fotobogen two-step key".')
  const flag = args.indexOf('--username')
  const wanted = flag >= 0 ? args[flag + 1] : undefined
  if (flag >= 0 && !wanted) throw new CliError('--username needs a name.')
  if (!existsSync(paths.db)) throw new CliError(`No Fotobogen database found at ${paths.db}. Check DATA_DIR.`)
  const db = new Database(paths.db, { fileMustExist: true })
  db.pragma('busy_timeout = 5000')
  try {
    const admins = db.prepare(`select id, username, totp_secret from users order by created_at`).all()
    if (admins.length === 0) throw new CliError('There is no admin account yet. Finish setup in the browser first.')
    const user = wanted ? admins.find(row => row.username === wanted) : admins[0]
    if (!user) throw new CliError(`No user named "${wanted}".`)
    if (!user.totp_secret) {
      console.log(`Two-step login is already off for ${user.username}. Nothing was changed.`)
      return
    }
    // A new session version signs out every browser: whoever is in must log in again.
    db.prepare(`update users set totp_secret = null, totp_last_step = null, backup_codes = null, session_version = session_version + 1 where id = ?`).run(user.id)
    console.log(`Two-step login is now off for ${user.username}, and all sessions were signed out. Log in with the password, then switch it on again under Admin, Two-step login.`)
  }
  finally {
    db.close()
  }
}

const [command, ...args] = process.argv.slice(2)
// The settings the server uses, DATA_DIR above all: a backup, a restore, or a
// new password must go to the same data folder the site is running on.
// What is set in the environment still comes first.
if (existsSync('.env')) process.loadEnvFile('.env')
try {
  if (command === 'reset-admin') {
    await resetAdmin(args)
  }
  else if (command === 'two-step') {
    await twoStep(args)
  }
  else if (command === 'import') {
    const paths = dataPaths(resolveDataDir(process.env, process.cwd()))
    const { importFolder, IMPORT_USAGE } = await import('./import.mjs')
    if (args.length === 0) throw new CliError(IMPORT_USAGE)
    if (!existsSync(paths.db)) throw new CliError(`No Fotobogen database found at ${paths.db}. Start the app once first, or check DATA_DIR.`)
    process.exitCode = await importFolder(args, { dbPath: paths.db, env: process.env, log: line => console.log(line), fail: message => new CliError(message) })
  }
  else if (command === 'seed-fetch') {
    await seedFetch()
  }
  else if (command === 'init') {
    await init()
  }
  else if (command === 'preflight') {
    await preflight()
  }
  else if (command === 'module') {
    await moduleTools(args)
  }
  else if (command === 'update') {
    await update(args)
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
  // Red at a terminal; plain in a log or a pipe.
  const { colourWanted, painter } = await import('../server/core/colour.ts')
  console.error(painter(colourWanted(process.env, process.stderr.isTTY === true)).red(error.message))
  process.exitCode = 1
}
