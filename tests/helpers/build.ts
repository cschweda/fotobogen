// Vitest global setup for the server tests: build the app once.
// Set FB_SKIP_BUILD=1 to reuse an existing .output while iterating.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

export default function setup() {
  if (process.env.FB_SKIP_BUILD === '1' && existsSync('.output/server/index.mjs')) return
  // pnpm is a .cmd shim on Windows, which needs a shell to run.
  execFileSync('pnpm', ['build'], { stdio: 'inherit', shell: process.platform === 'win32' })
}
