import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  const cookie = await completeSetup(server, { photoView: 'page' })
  await upload(server, cookie, await imageBuffer({ seed: 1, width: 900, height: 600 }), 'harbour.jpg')
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })

test('the licence and downloads are set for the site and for one photo, and visitors see them', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByLabel('Licence').selectOption({ label: 'CC BY-NC 4.0' })
  await page.getByRole('checkbox', { name: 'Let visitors download photos' }).check()
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toContainText('Settings saved.')

  await page.goto(server.url + '/photo/harbour')
  await expect(page.getByRole('link', { name: 'CC BY-NC 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-nc/4.0/')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download the original' }).click()])
  expect(download.suggestedFilename()).toBe('harbour.jpg')
  await expectNoAxeViolations(page)

  // One photo can go its own way.
  await page.goto(server.url + '/admin/photos')
  await page.getByRole('link', { name: 'Edit harbour.jpg' }).click()
  await expect(page.getByLabel('Licence')).toHaveValue('')
  await page.getByLabel('Licence').selectOption({ label: 'All rights reserved' })
  await page.getByLabel('Downloads').selectOption({ label: 'No downloads for this photo' })
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status')).toContainText('Details saved.')
  await page.goto(server.url + '/photo/harbour')
  await expect(page.getByText('All rights reserved')).toBeVisible()
  await expect(page.getByRole('link', { name: /Download/ })).toHaveCount(0)
})

test('the watermark module offers a text field built from its declaration', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('link', { name: 'Modules' }).click()
  await page.getByRole('checkbox', { name: 'On: Watermark' }).check()
  await page.getByRole('checkbox', { name: 'Watermark: Text mark' }).check()
  const text = page.getByLabel(/^Text \(capitals/)
  await expect(text).toHaveValue('(C) YOUR NAME')
  await text.fill('ANSEL ADAMS')
  await expect(page.getByLabel('Position')).toHaveValue('bottom right')
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Apply to all photos' }).click()
  await expect(page.locator('p[role="status"]')).toContainText('Saved for all photos.')
})
