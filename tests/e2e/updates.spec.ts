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
  await expect(heading(page, 'Overview')).toBeVisible()
  // Nothing is known, and nothing is checked until the owner says it may be: the admin asks, once.
  await expect(page.getByRole('heading', { name: /is available/ })).toHaveCount(0)
  const toast = page.getByRole('complementary', { name: 'Hear about new versions?' })
  await expect(toast).toContainText('Nothing about your site is sent.')
  await expectNoAxeViolations(page)
  await toast.getByRole('button', { name: 'No thanks' }).click()
  await expect(toast).toHaveCount(0)
  await page.reload()
  await expect(heading(page, 'Overview')).toBeVisible()
  await expect(toast).toHaveCount(0)

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

  // Every other admin page now says so, in a note. Nothing is installed by itself.
  await page.goto(server.url + '/admin')
  const news = page.getByRole('complementary', { name: 'Version 9.2.0 is available' })
  await expect(news).toContainText('Installing it is up to you.')
  await expectNoAxeViolations(page)
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await expect(news).toBeVisible()

  // Closed, it stays closed on every admin page for the rest of the session.
  await news.getByRole('button', { name: 'Close' }).click()
  await expect(news).toHaveCount(0)
  await page.goto(server.url + '/admin')
  await expect(heading(page, 'Overview')).toBeVisible()
  await expect(news).toHaveCount(0)
  await page.goto(server.url + '/admin/settings')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(news).toHaveCount(0)
  // The System page still says it.
  await page.goto(server.url + '/admin/system')
  await expect(page.getByRole('heading', { name: 'Version 9.2.0 is available' })).toBeVisible()

  // A new session: logging in again brings the note back.
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(heading(page, 'Overview')).toBeVisible()
  await expect(news).toBeVisible()
})

test('saying yes checks straight away, and the note leads to the System page', async ({ page }) => {
  release = { tag_name: 'v9.2.0', html_url: 'https://github.com/cschweda/fotobogen/releases/tag/v9.2.0' }
  const fresh = await startServer({ env: { UPDATES_URL: `http://127.0.0.1:${(github.address() as { port: number }).port}/latest` } })
  try {
    await completeSetup(fresh)
    await page.goto(fresh.url + '/login')
    await page.getByLabel('Username').fill(ADMIN.username)
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.getByRole('complementary', { name: 'Hear about new versions?' }).getByRole('button', { name: 'Yes, check once a day' }).click()
    const news = page.getByRole('complementary', { name: 'Version 9.2.0 is available' })
    await expect(news).toBeVisible()
    await news.getByRole('link', { name: 'See what is new' }).click()
    await expect(heading(page, 'System')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Check once a day' })).toBeChecked()
    // The System page has the whole story, so the note stays out of its way.
    await expect(news).toHaveCount(0)
  }
  finally {
    await fresh.stop()
  }
})
