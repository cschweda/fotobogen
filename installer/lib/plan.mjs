// What the installer decides, kept apart from what it does, so each
// decision can be tested without a network, git, or a terminal.
// No dependencies: this file and Node.js are all there is.

export const REPO = 'https://github.com/cschweda/fotobogen.git'
export const DEFAULT_FOLDER = 'fotobogen'
/** What Fotobogen itself needs. The installer runs on older Node.js so that it can say so. */
export const NEEDS = { node: 24, pnpm: 10 }

/** The name, large, so that it is plain the install has started. Plain ASCII: it prints on any terminal. */
export const BANNER = [
  "  _____     _        _",
  " |  ___|__ | |_ ___ | |__   ___   __ _  ___ _ __",
  " | |_ / _ \\| __/ _ \\| '_ \\ / _ \\ / _` |/ _ \\ '_ \\",
  " |  _| (_) | || (_) | |_) | (_) | (_| |  __/ | | |",
  " |_|  \\___/ \\__\\___/|_.__/ \\___/ \\__, |\\___|_| |_|",
  "                                 |___/",
]

export const HELP = `Installs Fotobogen, a photo website you host yourself.

  npx fotobogen@latest [folder] [options]
  npx fotobogen@latest install [folder] [options]     (the same)

  folder             Where to put it: a folder that does not exist yet. Asked for if
                     left out (default: ${DEFAULT_FOLDER}).

Options
  --release <x.y.z>  Install this version instead of the newest.
  --yes, -y          Ask nothing: take the defaults, and do not start it at the end.
  --no-start         Do not offer to start it at the end.
  --version, -v      Print this installer's version.
  --help, -h         Print this.

It checks for Node.js ${NEEDS.node}, git, and pnpm ${NEEDS.pnpm}; fetches the newest release
with git; installs its packages; builds it; and offers to start it. Nothing is
installed outside the folder you name, except pnpm if you agree to that.
`

/** Reads the command line. `problem` is set when it cannot be understood. */
export function parseArgs(argv) {
  const options = { folder: null, release: null, yes: false, start: true, help: false, version: false, problem: null }
  // "npx fotobogen install" reads naturally, and installing is all this does: the word may be said first.
  if (argv[0] === 'install') argv = argv.slice(1)
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--version' || arg === '-v') options.version = true
    else if (arg === '--yes' || arg === '-y') options.yes = true
    else if (arg === '--no-start') options.start = false
    else if (arg === '--release' || arg.startsWith('--release=')) {
      const value = arg === '--release' ? argv[++index] : arg.slice('--release='.length)
      const version = releaseVersion(value ?? '')
      if (!version) options.problem = `--release takes a version such as 1.7.0, not "${value ?? ''}".`
      options.release = version
    }
    else if (arg.startsWith('-')) options.problem = `There is no option ${arg}. Run with --help to see the options.`
    else if (options.folder !== null) options.problem = `Give one folder, not two ("${options.folder}" and "${arg}").`
    else options.folder = arg
    if (options.problem) break
  }
  return options
}

/** "1.7.0" from "1.7.0" or "v1.7.0"; null for anything else. */
export function releaseVersion(text) {
  const found = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(text).trim())
  return found ? `${Number(found[1])}.${Number(found[2])}.${Number(found[3])}` : null
}

const parts = version => version.split('.').map(Number)
/** Negative when a is older than b. */
export function compareVersions(a, b) {
  const [x, y] = [parts(a), parts(b)]
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

/**
 * The newest release among the tags `git ls-remote --tags` lists.
 * Only tags of the exact form v1.2.3 count: no pre-releases, nothing else.
 */
export function newestRelease(lsRemoteOutput) {
  let newest = null
  for (const line of String(lsRemoteOutput).split('\n')) {
    const found = /\trefs\/tags\/(v\d{1,4}\.\d{1,4}\.\d{1,4})$/.exec(line.trim().replace(/\^\{\}$/, ''))
    const version = found ? releaseVersion(found[1]) : null
    if (version && (newest === null || compareVersions(version, newest) > 0)) newest = version
  }
  return newest
}

/**
 * A name to suggest when the one asked for is taken: the same with -2, -3,
 * and so on, the first that `taken` says is free.
 */
export function freeName(name, taken) {
  const base = String(name).replace(/[\\/]+$/, '')
  for (let number = 2; number < 100; number++) {
    if (!taken(`${base}-${number}`)) return `${base}-${number}`
  }
  return `${base}-new`
}

/** What is wrong with a folder name as typed, or null. Whether it is free is checked on disk, separately. */
export function folderProblem(name) {
  const text = String(name ?? '').trim()
  if (text === '') return 'Give the folder a name.'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) return 'A folder name cannot contain control characters.'
  if (text.length > 240) return 'That name is too long.'
  if (/^-/.test(text)) return 'A folder name cannot begin with a hyphen.'
  if (/[<>"|?*]/.test(text)) return 'A folder name cannot contain any of < > " | ? *'
  return null
}

/** The major version in the text a tool prints for --version, or null. */
export function majorOf(text) {
  const found = /(\d+)\.\d+/.exec(String(text ?? ''))
  return found ? Number(found[1]) : null
}

/**
 * What stands in the way, in the order to deal with it. `node`, `git`, and
 * `pnpm` are what each printed for --version, or null if it would not run.
 */
export function toolProblems(found) {
  const problems = []
  const node = majorOf(found.node)
  if (node === null || node < NEEDS.node) {
    problems.push({ tool: 'node', message: `Fotobogen needs Node.js ${NEEDS.node} or later; this is ${found.node ?? 'unknown'}. Install it from https://nodejs.org, or with nvm: nvm install ${NEEDS.node} && nvm use ${NEEDS.node}. Then run this again.` })
  }
  if (found.git === null) {
    problems.push({ tool: 'git', message: 'git is needed to fetch Fotobogen and, later, its updates. Install it from https://git-scm.com (on a Mac: xcode-select --install), then run this again.' })
  }
  const pnpm = majorOf(found.pnpm)
  if (pnpm === null) problems.push({ tool: 'pnpm', missing: true, message: `pnpm ${NEEDS.pnpm} is needed to install and build Fotobogen.` })
  else if (pnpm < NEEDS.pnpm) problems.push({ tool: 'pnpm', missing: false, message: `Fotobogen needs pnpm ${NEEDS.pnpm} or later; this is ${String(found.pnpm).trim()}.` })
  return problems
}

/**
 * Whether a tool is on the path, found by looking and not by running it:
 * asking pm2 for its version starts pm2's background process, which an
 * installer has no business doing.
 */
export function isOnPath(name, { path, platform, exists }) {
  const windows = platform === 'win32'
  const names = windows ? [`${name}.cmd`, `${name}.exe`, `${name}.bat`, name] : [name]
  const separator = windows ? '\\' : '/'
  return String(path ?? '').split(windows ? ';' : ':').filter(Boolean)
    .some(folder => names.some(file => exists(folder.replace(/[\\/]+$/, '') + separator + file)))
}

/**
 * Whether this machine looks like a server managed by Laravel Forge. Forge
 * runs sites as the user "forge", from /home/forge, and keeps its nginx
 * pieces in /etc/nginx/forge-conf. Any one of the three is taken as a sign.
 * Only on Linux: Forge manages nothing else.
 */
export function looksLikeForge({ platform, username, exists }) {
  if (platform !== 'linux') return false
  return username === 'forge' || exists('/etc/nginx/forge-conf') || exists('/home/forge')
}

/**
 * What to say at the end about running it on a server. `pm2` is whether pm2
 * was found. The pm2 settings file is part of every install, so
 * it is mentioned whether or not pm2 is there.
 */
export function serverNotes({ folder, pm2, forge }) {
  const lines = [
    'On a server, use pm2 to keep it running and to start it again after a restart.',
    'Its settings file, ecosystem.config.cjs, is already in the folder, whether or',
    'not pm2 is installed.',
  ]
  if (pm2) {
    lines.push('pm2 is installed. To run Fotobogen under it:')
  }
  else {
    lines.push('pm2 is not installed on this machine. To install it (about pm2: https://pm2.io):', '  npm install -g pm2', 'Then, to run Fotobogen under it:')
  }
  lines.push(`  cd ${folder}`, '  pm2 start ecosystem.config.cjs', '  pm2 save', '  pm2 startup     (prints one command; run it, so pm2 starts with the server)')
  if (forge) {
    lines.push(
      '',
      'This looks like a server managed by Laravel Forge. Fotobogen sits behind',
      'nginx there, and nginx needs two things, set in Forge under your site,',
      'Edit Nginx Configuration:',
      '',
      '  1. Requests sent on to Fotobogen (5150, or the PORT in its .env):',
      '       location / {',
      '           proxy_pass http://127.0.0.1:5150;',
      '           ...',
      '       }',
      '  2. Room for uploads. nginx stops at 1 MB unless told otherwise, which',
      '     refuses nearly every photo with "413 Request Entity Too Large":',
      '       client_max_body_size 50m;',
      '',
      'The whole file to paste, with the headers the proxy must send, is in the',
      'folder as deploy/forge-nginx.conf. The steps are at',
      'https://fotobogen.com/docs/installation/#forge-pm2',
    )
  }
  else {
    lines.push('', 'A domain, https, and nginx: https://fotobogen.com/docs/installation/')
  }
  return lines
}

/** y, yes, or just Enter when the default is yes. */
export function saysYes(answer, fallback) {
  const text = String(answer ?? '').trim().toLowerCase()
  if (text === '') return fallback
  if (text === 'y' || text === 'yes') return true
  if (text === 'n' || text === 'no') return false
  return null
}
