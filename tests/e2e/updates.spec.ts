import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let github: Server
let release: Record<string, string> = { tag_name: 'v0.0.1' }
let server: TestServer
test.beforeAll(async () => {
  github = createServer((_request, response) => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(release)))
  await new Promise<void>(listening => github.listen(0, '127.0.0.1', listening))
  server = await startServer({ env: { UPDATES_URL: `http://127.0.0.1:${(github.address() as { port: number }).port}/latest` } })
  await completeSetup(server)
})
test.afterAll(async () => {
  await server.stop()
  await new Promise(closed => github.close(closed))
})

test('the admin checks for updates on request, and the dashboard says when there is a newer version', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(heading(page, 'Admin')).toBeVisible()
  // Nothing is known, so the dashboard says nothing.
  await expect(page.getByRole('heading', { name: /is available/ })).toHaveCount(0)

  await page.getByRole('link', { name: 'System' }).click()
  await expect(page.getByText('It has not checked for a newer one.')).toBeVisible()
  await page.getByRole('button', { name: 'Check for updates' }).click()
  await expect(page.getByText('That is the latest version.')).toBeVisible()
  await expectNoAxeViolations(page)

  release = { tag_name: 'v9.2.0', html_url: 'https://github.com/cschweda/fotobogen/releases/tag/v9.2.0' }
  await page.getByRole('button', { name: 'Check for updates' }).click()
  await expect(page.getByRole('heading', { name: 'Version 9.2.0 is available' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'See what changed and how to update' })).toHaveAttribute('href', 'https://github.com/cschweda/fotobogen/releases/tag/v9.2.0')
  await page.getByRole('checkbox', { name: 'Check once a day' }).check()
  await expect(page.locator('p[role="status"]').filter({ hasText: 'once a day' })).toBeVisible()
  await expectNoAxeViolations(page)

  await page.goto(server.url + '/admin')
  await expect(page.getByRole('heading', { name: 'Version 9.2.0 is available' })).toBeVisible()
  await expectNoAxeViolations(page)
})
