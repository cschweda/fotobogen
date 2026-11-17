#!/usr/bin/env node
// npx create-fotobogen@latest
//
// Installs Fotobogen in one command: checks the tools, asks where to put it,
// fetches the newest release with git, installs its packages, builds it, and
// offers to start it. The first start then asks its own few questions (port,
// site address) and shows the address to open.
//
// It does what the README's install steps do by hand, and nothing else. It
// has no dependencies, and fetches with git so that updating from the admin
// works afterwards. Written to run on Node.js 18, so that on an old Node.js
// it can say what is needed rather than fail to start.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { userInfo } from 'node:os'
import { fileURLToPath } from 'node:url'
import { BANNER, DEFAULT_FOLDER, HELP, NEEDS, REPO, folderProblem, freeName, isOnPath, looksLikeForge, newestRelease, parseArgs, saysYes, serverNotes, toolProblems } from '../lib/plan.mjs'

const windows = process.platform === 'win32'
const own = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'))
// Another place to fetch from: a fork, or a copy on this machine.
const repo = process.env.CREATE_FOTOBOGEN_REPO || REPO

const say = text => process.stdout.write(`${text}\n`)
const step = text => say(`\n› ${text}`)
function stop(message) {
  process.stderr.write(`\n${message}\n`)
  process.exit(1)
}

/**
 * npm and pnpm are batch files on Windows, which Node.js starts only through
 * the command processor. What is passed to them here is fixed words, never
 * anything typed by the person installing. git is a program on every system.
 */
const command = (name, args) => windows && name !== 'git' ? ['cmd.exe', ['/d', '/s', '/c', name, ...args]] : [name, args]

/**
 * The environment the tools are run in: this one, without what npm adds when
 * the installer is started with npx. pnpm would pass those on to Fotobogen's
 * own install check, which, seeing npm's name there, refuses to install.
 */
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^npm_/i.test(name) && name !== 'INIT_CWD'))

/** Runs a tool and gives back what it printed, or null if it would not run. */
function printed(name, args, cwd) {
  const [file, list] = command(name, args)
  const result = spawnSync(file, list, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 })
  return result.status === 0 ? result.stdout.trim() : null
}

/** Runs a tool with its output shown as it happens. Resolves to its exit code. */
function shown(name, args, cwd) {
  const [file, list] = command(name, args)
  return new Promise((done) => {
    const child = spawn(file, list, { cwd, env, stdio: 'inherit' })
    child.on('error', () => done(127))
    child.on('exit', code => done(code ?? 1))
  })
}

const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true
function ask(question) {
  return new Promise((done) => {
    const reader = createInterface({ input: process.stdin, output: process.stdout })
    reader.question(question, (answer) => {
      reader.close()
      done(answer)
    })
  })
}
async function askYes(question, fallback) {
  for (;;) {
    const answer = saysYes(await ask(question), fallback)
    if (answer !== null) return answer
    say('  Answer y for yes or n for no.')
  }
}

/**
 * Why this folder cannot be used, or null. It must not exist: the installer
 * never writes into a folder that is already there, empty or not, so nothing
 * of yours can be overwritten or mixed up with a new install.
 */
function folderTaken(name) {
  const path = resolve(name)
  if (!existsSync(path)) return existsSync(dirname(path)) ? null : `There is no folder ${dirname(path)} to put it in.`
  let what = `"${name}" already exists here (${path}).`
  try {
    const found = JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8'))
    if (found.name === 'fotobogen') what += ` It holds Fotobogen ${found.version}. To update that copy, use Admin, System in its admin, or run "pnpm fotobogen update" in that folder.`
  }
  catch { /* not an install of Fotobogen, or not a folder: the first sentence says enough */ }
  return `${what}\nNothing was changed. To install a new copy beside it, give another name:\n  npx create-fotobogen@latest ${freeName(name, other => existsSync(resolve(other)))}`
}

const options = parseArgs(process.argv.slice(2))
if (options.problem) stop(options.problem)
if (options.help) {
  say(HELP)
  process.exit(0)
}
if (options.version) {
  say(own.version)
  process.exit(0)
}

const asking = interactive && !options.yes

// The folder named on the command line is looked at before anything else is said or done.
if (options.folder !== null) {
  const problem = folderProblem(options.folder) ?? folderTaken(options.folder)
  if (problem) stop(problem)
}
else if (!asking) {
  const problem = folderTaken(DEFAULT_FOLDER)
  if (problem) stop(problem)
}

// The name, in Fotobogen's red where the terminal shows colour.
const colour = process.stdout.isTTY === true && !process.env.NO_COLOR && process.env.TERM !== 'dumb'
say('')
for (const line of BANNER) say(colour ? `\u001b[31m${line}\u001b[0m` : line)
say('')
say(`  Installer ${own.version}. Publish your photographs on a website of your own.`)
say('  https://fotobogen.com')

// ── 1. The tools ────────────────────────────────────────────────────
step('Checking for Node.js, git, and pnpm')
let problems = toolProblems({ node: process.version, git: printed('git', ['--version']), pnpm: printed('pnpm', ['--version']) })
const fatal = problems.find(problem => problem.tool !== 'pnpm')
if (fatal) stop(fatal.message)
if (problems.length > 0) {
  const { message, missing } = problems[0]
  const fix = `npm install -g pnpm@${NEEDS.pnpm}`
  say(`  ${message}`)
  if (!asking || !(await askYes(`  ${missing ? 'Install' : 'Update'} it now with "${fix}"? [Y/n] `, true))) {
    stop(`Install it with: ${fix}\nThen run this again.`)
  }
  if (await shown('npm', ['install', '-g', `pnpm@${NEEDS.pnpm}`]) !== 0) {
    stop(`pnpm could not be installed. Try it yourself: ${fix}\n(If it says permission denied, your Node.js was installed for all users; nvm avoids that.) Then run this again.`)
  }
  problems = toolProblems({ node: process.version, git: 'git 2.0', pnpm: printed('pnpm', ['--version']) })
  if (problems.length > 0) stop(`pnpm was installed but cannot be run from here. Open a new terminal and run this again.`)
}
say(`  Node.js ${process.version.slice(1)}, ${printed('git', ['--version'])}, pnpm ${printed('pnpm', ['--version'])}.`)
// A server managed by Laravel Forge needs its nginx told two things; said here and, in full, at the end.
const forge = looksLikeForge({ platform: process.platform, username: (() => { try { return userInfo().username } catch { return '' } })(), exists: existsSync })
if (forge) say('  This looks like a Laravel Forge server: nginx will need a proxy and room for uploads. The details come at the end.')

// ── 2. Where to put it ──────────────────────────────────────────────
let folder = options.folder ?? (asking ? null : DEFAULT_FOLDER)
if (folder === null) {
  say('')
  say('Each install is a folder of its own, with its own photos and settings.')
  say('The folder must not exist yet; the installer makes it.')
  for (;;) {
    const suggestion = existsSync(resolve(DEFAULT_FOLDER)) ? freeName(DEFAULT_FOLDER, other => existsSync(resolve(other))) : DEFAULT_FOLDER
    const answer = (await ask(`Folder to install into? Press Enter for "${suggestion}": `)).trim() || suggestion
    const problem = folderProblem(answer) ?? folderTaken(answer)
    if (!problem) {
      folder = answer
      break
    }
    say(`  ${problem.split('\n')[0]} Choose another name.`)
  }
}
const target = resolve(folder)

// ── 3. Which version ────────────────────────────────────────────────
step('Finding the newest release')
let release = options.release
if (!release) {
  const tags = printed('git', ['ls-remote', '--tags', '--refs', repo])
  if (tags === null) stop(`The list of releases could not be read from ${repo}. Check that this computer is online, then run this again.`)
  release = newestRelease(tags)
  if (!release) stop(`No release was found at ${repo}.`)
}
say(`  Version ${release}.`)

// ── 4. Fetch, install, build ────────────────────────────────────────
step(`Fetching Fotobogen ${release} into ${target}`)
// "--" ends the options, so a folder name can never be read as one.
if (await shown('git', ['clone', '--quiet', '--', repo, target]) !== 0) {
  stop(`Fotobogen could not be fetched from ${repo}. Check that this computer is online. If the folder ${target} was made, delete it, then run this again.`)
}
// The branch stays, so "git pull" and the admin's Update button both work later; the files are the release's.
if (printed('git', ['rev-parse', '-q', '--verify', `refs/tags/v${release}^{commit}`], target) === null) {
  stop(`There is no version ${release}. The releases are listed at https://github.com/cschweda/fotobogen/releases. Delete the folder ${target} before trying again.`)
}
if (printed('git', ['reset', '--quiet', '--hard', `v${release}`], target) === null) {
  stop(`Version ${release} was fetched but could not be put in place. Delete the folder ${target}, then run this again.`)
}
let version = null
try {
  version = JSON.parse(readFileSync(resolve(target, 'package.json'), 'utf8')).version
}
catch { /* said below */ }
if (version !== release) stop(`What was fetched says it is version ${version ?? 'unknown'}, not ${release}. Nothing was built. Delete the folder ${target}, then run this again.`)

const again = `cd ${folder}\n  pnpm install\n  pnpm build\n  pnpm start`
step('Installing its packages (a minute or two)')
if (await shown('pnpm', ['install'], target) !== 0) {
  stop(`The packages could not be installed; what went wrong is printed above. Nothing is lost: when it is put right, carry on with\n  ${again}`)
}
step('Building it (a few minutes; it needs about 2 GB of memory)')
if (await shown('pnpm', ['build'], target) !== 0) {
  stop(`The build did not finish; what went wrong is printed above. Nothing is lost: when it is put right, carry on with\n  cd ${folder}\n  pnpm build\n  pnpm start`)
}

// ── 5. Done ─────────────────────────────────────────────────────────
say('')
say(`Fotobogen ${release} is installed in ${target}`)
say('')
say('To start it, now or any time:')
say(`  cd ${folder}`)
say('  pnpm start')
say('')
say('The first start asks a few questions, then prints the address to open')
say('and a setup token to type there. Control + C stops it.')
say('')
for (const line of serverNotes({ folder, pm2: isOnPath('pm2', { path: process.env.PATH ?? process.env.Path, platform: process.platform, exists: existsSync }), forge })) say(line)

if (asking && options.start && await askYes('\nStart it now? [Y/n] ', true)) {
  say('')
  process.exit(await shown('pnpm', ['start'], target))
}
