// pm2 process file for running Fotobogen without Docker (Node 24 required).
//
//   pnpm install --frozen-lockfile && pnpm build
//   pm2 start ecosystem.config.cjs
//   pm2 logs fotobogen            # shows the setup token
//
// Put nginx in front of it with deploy/forge-nginx.conf.
//
// There is nothing to edit here. The port comes from PORT in .env (5150 if
// it is not set there), and every other setting is read from .env by
// Fotobogen itself when it starts. `pnpm fotobogen init` asks for the port,
// the site's address, and demo mode, and writes .env for you.
const fs = require('node:fs')
const path = require('node:path')

/** PORT from the .env beside this file, or 5150. pm2 must be told a fixed port: nginx points at it. */
function port() {
  try {
    const set = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').match(/^[ \t]*PORT=[ \t]*(\d{1,5})[ \t]*\r?$/m)
    const number = set ? Number(set[1]) : 0
    return number >= 1 && number <= 65535 ? number : 5150
  }
  catch {
    return 5150
  }
}

module.exports = {
  apps: [
    {
      name: 'fotobogen',
      script: 'scripts/start.mjs', // preflight check, then the server
      cwd: __dirname,
      instances: 1, // one process: the image queue and login limiter live in memory
      exec_mode: 'fork',
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: port(),
        DATA_DIR: path.join(__dirname, 'data'),
        // nginx on the same machine is the only client. Remove this line
        // if the app is ever exposed directly.
        TRUST_PROXY: '1',
      },
    },
  ],
}
