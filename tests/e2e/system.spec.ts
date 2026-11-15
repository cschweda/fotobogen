import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  const cookie = await completeSetup(server)
  await upload(server, cookie, await imageBuffer({ seed: 1, width: 400, height: 300 }), 'harbour.jpg')
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })

test('the System page shows what is stored, downloads a backup, and stages a restore', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('link', { name: 'System' }).click()
  await expect(heading(page, 'System')).toBeVisible()
  await expect(page.getByText(/Fotobogen \d+\.\d+\.\d+, Node 24/)).toBeVisible()
  await expectNoAxeViolations(page)

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download a backup' }).click()])
  expect(download.suggestedFilename()).toMatch(/^fotobogen-backup-\d{4}-\d\d-\d\d\.zip$/)
  const file = await download.path()

  // Pressed with no file chosen, the form says so.
  await page.getByRole('button', { name: 'Upload and prepare restore' }).click()
  await expect(page.getByRole('alert')).toContainText('Choose a backup file first.')

  await page.getByLabel('Choose a backup file').setInputFiles(file)
  await page.getByRole('button', { name: 'Upload and prepare restore' }).click()
  await expect(page.getByText('A backup is waiting to be restored.')).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Cancel the restore' }).click()
  await expect(page.getByRole('button', { name: 'Upload and prepare restore' })).toBeVisible()
})
