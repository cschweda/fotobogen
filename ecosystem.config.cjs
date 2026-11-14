// pm2 process file for running Fotobogen without Docker (Node 24 required).
//
//   pnpm install --frozen-lockfile && pnpm build
//   pm2 start ecosystem.config.cjs
//   pm2 logs fotobogen            # shows the setup token
//
// Put nginx in front of it with deploy/forge-nginx.conf.
const path = require('node:path')

module.exports = {
  apps: [
    {
      name: 'fotobogen',
      script: '.output/server/index.mjs',
      cwd: __dirname,
      instances: 1, // one process: the image queue and login limiter live in memory
      exec_mode: 'fork',
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3000,
        DATA_DIR: path.join(__dirname, 'data'),
        // nginx on the same machine is the only client. Remove this line
        // if the app is ever exposed directly.
        TRUST_PROXY: '1',
      },
    },
  ],
}
