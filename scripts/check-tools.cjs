// Checks, before anything else is done, that this machine has what
// Fotobogen needs to install and build: a new enough Node.js, and pnpm.
//
// It runs at the very start of `pnpm install` (from .pnpmfile.cjs, which pnpm
// reads first), and before `pnpm build` and `pnpm dev`,
// so a wrong version stops the first command with a plain explanation,
// instead of an install that seems to work and a start that then refuses.
// (`pnpm start` has the fuller preflight check: memory, disk, and so on.)
//
// It is written in the oldest plain JavaScript, with nothing imported from
// the project, so that it runs, and can explain itself, on any Node.js at all.
'use strict'

var pkg = require('../package.json')

/** What is wrong, as lines to print; empty when all is well. Kept apart from the printing so it can be tested. */
function problems(facts) {
  var found = []
  var needNode = Number(String(pkg.engines.node).replace(/[^0-9.]/g, '').split('.')[0])
  var needPnpm = Number(String(pkg.packageManager).split('@')[1].split('.')[0])
  var haveNode = Number(String(facts.nodeVersion).replace(/^v/, '').split('.')[0])

  if (!(haveNode >= needNode)) {
    var lines = [
      'Node.js ' + needNode + ' or later is needed. This terminal is using Node.js ' + String(facts.nodeVersion).replace(/^v/, '') + '.',
      '',
    ]
    if (facts.hasNvm) {
      lines.push(
        'You have nvm, so switch this terminal to Node.js ' + needNode + ':',
        '',
        '    nvm install ' + needNode + '        (only if it is not installed yet)',
        '    nvm use ' + needNode,
        '',
        'nvm keeps tools such as pnpm separately for each version of Node.js,',
        'so after switching, install pnpm for this one:',
        '',
        '    npm install -g pnpm@' + needPnpm,
        '',
        'To make new terminals start with Node.js ' + needNode + ':  nvm alias default ' + needNode,
        '(That does not change a terminal that is already open; "nvm use" does.)'
      )
    }
    else {
      lines.push('Install it from https://nodejs.org, open a new terminal, and check with:  node --version')
    }
    lines.push(
      '',
      'Then, in this folder, install again from the start. Anything installed',
      'under the old Node.js will not work under the new one:',
      '',
      facts.windows ? '    Remove-Item -Recurse -Force node_modules' : '    rm -rf node_modules',
      '    pnpm install',
      '    pnpm build',
      '    pnpm start'
    )
    found.push(lines)
  }

  // Which tool is running this install, if one is: "pnpm/10.33.4 npm/? node/v24..." or "npm/11.0.0 ...".
  var agent = String(facts.userAgent || '')
  if (agent) {
    var tool = agent.split(' ')[0].split('/')
    if (tool[0] !== 'pnpm') {
      found.push([
        'Fotobogen is installed with pnpm, not ' + tool[0] + '.',
        '',
        '    npm install -g pnpm@' + needPnpm,
        '    pnpm install',
      ])
    }
    else if (!(Number(tool[1].split('.')[0]) >= needPnpm)) {
      found.push([
        'pnpm ' + needPnpm + ' or later is needed. This is pnpm ' + tool[1] + '.',
        '',
        '    npm install -g pnpm@' + needPnpm,
      ])
    }
  }
  return found
}

/** Runs the check for real: prints what is wrong and stops, or says nothing. */
function run() {
  var facts = {
    nodeVersion: process.version,
    userAgent: process.env.npm_config_user_agent,
    hasNvm: Boolean(process.env.NVM_DIR || process.env.NVM_HOME),
    windows: process.platform === 'win32',
  }
  var found = problems(facts)
  if (found.length === 0) return
  var out = ['', 'Fotobogen cannot be installed or built yet.', '']
  for (var i = 0; i < found.length; i++) {
    for (var j = 0; j < found[i].length; j++) out.push(found[i][j] ? '  ' + found[i][j] : '')
    out.push('')
  }
  console.error(out.join('\n'))
  process.exit(1)
}

module.exports = { problems: problems, run: run }

if (require.main === module) run()
