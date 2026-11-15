import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'
import { expectNoAxeViolations } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  const cookie = await completeSetup(server)
  await upload(server, cookie, await imageBuffer({ seed: 1, width: 400, height: 300 }), 'harbour.jpg')
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })

test('a photo is scheduled for later from its page, and new uploads can be made drafts', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('link', { name: 'Photos', exact: true }).click()
  await page.getByRole('link', { name: 'Edit harbour.jpg' }).click()

  await expect(page.getByRole('radio', { name: 'Public: shown on your site' })).toBeChecked()
  await page.getByRole('radio', { name: 'Scheduled: public from a date and time' }).check()
  await page.getByLabel('Goes public on').fill('2099-06-01T09:30')
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status')).toContainText('Details saved.')
  // Stored as that local time; and no "View on site" link while it is not live.
  expect(query<{ publish_at: number }>(server, 'select publish_at from photos')[0]!.publish_at).toBe(new Date('2099-06-01T09:30').getTime())
  await expect(page.getByRole('link', { name: 'View on site' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('radio', { name: 'Scheduled: public from a date and time' })).toBeChecked()
  await expect(page.getByLabel('Goes public on')).toHaveValue('2099-06-01T09:30')

  await page.goto(server.url + '/admin/photos')
  await expect(page.locator('.badge', { hasText: 'Scheduled for' })).toBeVisible()
  await page.getByLabel('Show').selectOption('scheduled')
  await expect(page.locator('.card')).toHaveCount(1)
  expect((await page.goto(server.url + '/photo/harbour'))?.status()).toBe(404)

  await page.goto(server.url + '/admin/settings')
  await page.getByRole('radio', { name: 'Stay hidden as drafts until you publish them' }).check()
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toContainText('Settings saved.')
  expect(query(server, `select value from settings where key = 'uploads.default_visibility'`)).toEqual([{ value: '"hidden"' }])
})
