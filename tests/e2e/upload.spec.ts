import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading, tabTo } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  await completeSetup(server)
})
test.afterAll(async () => { await server.stop() })

test.beforeEach(async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(heading(page, 'Admin')).toBeVisible()
})

test('the upload page is reached from the dashboard and needs a login', async ({ page, browser }) => {
  await expectNoAxeViolations(page)
  await page.getByRole('link', { name: 'Upload photos' }).click()
  await expect(page).toHaveURL(server.url + '/admin/upload')
  await expect(heading(page, 'Upload photos')).toBeVisible()
  await expect(page.getByText('0 photos in your library.')).toBeVisible()
  await expectNoAxeViolations(page)

  const stranger = await browser.newPage()
  await stranger.goto(server.url + '/admin/upload')
  await expect(stranger).toHaveURL(server.url + '/login')
  await stranger.close()
})

test('photos upload, are processed, and show their thumbnail; problems are explained per file', async ({ page }) => {
  await page.goto(server.url + '/admin/upload')
  const picker = page.getByLabel('Choose photos')
  await tabTo(page, picker) // the file picker is reachable by keyboard

  await picker.setInputFiles([
    { name: 'harbour.jpg', mimeType: 'image/jpeg', buffer: await imageBuffer({ seed: 301, width: 1200, height: 800 }) },
    { name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a photo') },
  ])

  const row = (name: string) => page.getByRole('listitem').filter({ hasText: name })
  await expect(row('harbour.jpg')).toContainText('Ready', { timeout: 30_000 })
  await expect(row('harbour.jpg').locator('img')).toHaveAttribute('src', /^\/media\/.+-thumb-[0-9a-f]{8}\.webp$/)
  await expect(row('notes.jpg')).toContainText('Not accepted')
  await expect(row('notes.jpg')).toContainText('JPEG, PNG, WebP, TIFF, or AVIF')
  await expect(page.getByText('1 photo in your library.')).toBeVisible()
  // The thumbnail really loads.
  await expect.poll(() => row('harbour.jpg').locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(480)
  await expectNoAxeViolations(page)

  // The same file again is recognised.
  await picker.setInputFiles([
    { name: 'harbour-copy.jpg', mimeType: 'image/jpeg', buffer: await imageBuffer({ seed: 301, width: 1200, height: 800 }) },
  ])
  await expect(row('harbour-copy.jpg')).toContainText('Already in your library')
  await expect(row('harbour-copy.jpg')).toContainText('Same file as "harbour.jpg".')
  await expectNoAxeViolations(page)
})
