// The Update panel on the System page, in each state it can be in. No real
// update is ever started here: the states are set up as an update would
// leave them, and the Update button is looked at but not pressed.
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let github: Server
const release = { tag_name: 'v9.9.9', html_url: 'https://github.com/cschweda/fotobogen/releases/tag/v9.9.9' }
const servers: TestServer[] = []
test.beforeAll(async () => {
  github = createServer((_request, response) => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(release)))
  await new Promise<void>(listening => github.listen(0, '127.0.0.1', listening))
})
test.afterAll(async () => {
  for (const server of servers) await server.stop()
  await new Promise(closed => github.close(closed))
})

/** A site that knows version 9.9.9 exists, with the owner logged in on its System page. */
async function systemPage(page: import('@playwright/test').Page, env: Record<string, string>) {
  const server = await startServer({ env: { UPDATES_URL: `http://127.0.0.1:${(github.address() as { port: number }).port}/latest`, ...env } })
  servers.push(server)
  const cookie = await completeSetup(server)
  await fetch(server.url + '/api/admin/updates', { method: 'POST', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: '{}' })
  await page.context().addCookies(cookie.split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name: name!, value: rest.join('='), url: server.url }
  }))
  await page.goto(server.url + '/admin/system')
  await expect(heading(page, 'System')).toBeVisible()
  return server
}

test('a copy in Docker is told the commands to run on the server', async ({ page }) => {
  await systemPage(page, { FOTOBOGEN_IN_DOCKER: '1' })
  const panel = page.getByRole('region', { name: 'Install version 9.9.9' })
  await expect(panel).toContainText('This copy runs in Docker. A container cannot replace itself')
  await expect(panel).toContainText('docker compose up -d --build')
  await expect(panel.getByRole('button', { name: /Update to version/ })).toHaveCount(0)
  await expectNoAxeViolations(page)
})

test('a copy installed with git is told exactly what updating does, and asked before it starts', async ({ page }) => {
  // This repository is a git checkout with git and pnpm, so the panel offers to update. It is not pressed past "Cancel".
  const server = await systemPage(page, { FOTOBOGEN_IN_DOCKER: '0' })
  const panel = page.getByRole('region', { name: 'Install version 9.9.9' })
  await expect(panel).toContainText('A copy of your database is saved in the data folder.')
  await expect(panel).toContainText('needs about 2 GB of memory')
  // Not under pm2 here, so the owner is told they will restart it themselves.
  await expect(panel).toContainText('You restart Fotobogen on the server')
  await expect(panel).toContainText('If any step fails, the old version is put back')
  await expectNoAxeViolations(page)

  await panel.getByRole('button', { name: 'Update to version 9.9.9' }).click()
  await expect(panel.getByText('Install version 9.9.9 now?')).toBeVisible()
  await expectNoAxeViolations(page)
  await panel.getByRole('button', { name: 'Cancel' }).click()
  await expect(panel.getByRole('button', { name: 'Update to version 9.9.9' })).toBeVisible()

  // While an update is under way: the steps so far, the current one marked.
  writeFileSync(join(server.dataDir, 'update-status.json'), JSON.stringify({
    state: 'running', version: '9.9.9', from: '1.0.0', step: 'Installing its packages', startedAt: Date.now(), pid: process.pid,
    log: ['Saving a copy of the database', '    kept at /data/before-update.db', 'Fetching version 9.9.9', 'Switching to version 9.9.9', 'Installing its packages'],
  }))
  await page.reload()
  const running = page.getByRole('region', { name: 'Installing version 9.9.9' })
  await expect(running.getByRole('listitem')).toHaveText(['Saving a copy of the database', 'Fetching version 9.9.9', 'Switching to version 9.9.9', 'Installing its packages'])
  await expect(running).toContainText('You can leave this page; the update carries on.')
  await expectNoAxeViolations(page)

  // Built, and waiting for the owner to restart.
  writeFileSync(join(server.dataDir, 'update-status.json'), JSON.stringify({ state: 'done', version: '9.9.9', from: '1.0.0', log: ['Version 9.9.9 is built and ready'], pid: null }))
  await page.reload()
  const ready = page.getByRole('region', { name: 'Version 9.9.9 is ready' })
  await expect(ready).toContainText('One step is left, and it is done on the server: restart Fotobogen.')
  await expect(ready).toContainText('pnpm start')
  await expectNoAxeViolations(page)

  // It did not work: why, what was done, and the way to try again.
  writeFileSync(join(server.dataDir, 'update-status.json'), JSON.stringify({
    state: 'failed', version: '9.9.9', from: '1.0.0', pid: null,
    error: 'The new version could not be built. This usually means the server ran out of memory; it needs about 2 GB, counting swap. The site was put back to version 1.0.0 and is unchanged.',
    log: ['Saving a copy of the database', 'Building it', '    FATAL ERROR: heap out of memory', 'Going back to version 1.0.0'],
  }))
  await page.reload()
  const failed = page.getByRole('region', { name: 'Install version 9.9.9' })
  await expect(failed).toContainText('The last update did not go through.')
  await expect(failed).toContainText('The site was put back to version 1.0.0 and is unchanged.')
  await failed.getByText('What happened, step by step').click()
  await expect(failed).toContainText('FATAL ERROR: heap out of memory')
  await expect(failed.getByRole('button', { name: 'Update to version 9.9.9' })).toBeVisible()
  await expectNoAxeViolations(page)
})
