import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  const cookie = await completeSetup(server, { photoView: 'page' })
  for (const [seed, name] of [[1, 'apple.jpg'], [2, 'birch.jpg'], [3, 'cedar.jpg']] as const) {
    await upload(server, cookie, await imageBuffer({ seed, width: 600, height: 400 }), name)
  }
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(heading(page, 'Admin')).toBeVisible()
})

test('an album is created, filled from the library, and edited', async ({ page }) => {
  await page.getByRole('link', { name: 'Albums' }).click()
  await expect(heading(page, 'Albums')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByRole('button', { name: 'Create album' }).click()
  await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Name').fill('Trees')
  await page.getByLabel('Description (optional)').fill('Mostly birch.')
  await page.getByRole('button', { name: 'Create album' }).click()
  await expect(page.getByRole('heading', { name: 'Trees' })).toBeVisible()
  await expect(page.getByText('0 photos')).toBeVisible()

  await page.goto(server.url + '/admin/photos')
  await page.getByRole('checkbox', { name: 'birch.jpg' }).check()
  await page.getByRole('checkbox', { name: 'cedar.jpg' }).check()
  // Pressed with nothing chosen, the buttons say what is missing.
  await page.getByRole('button', { name: 'Add to album' }).click()
  await expect(page.getByRole('alert')).toContainText('Choose an album first.')
  await page.getByLabel('Album to add the selected photos to').selectOption({ label: 'Trees' })
  await page.getByRole('button', { name: 'Add to album' }).click()
  await expect(page.getByRole('status')).toContainText('2 photos added to the album.')
  await page.getByLabel('Tag to add to the selected photos').fill('woodland')
  await page.getByRole('button', { name: 'Add tag' }).click()
  await expect(page.getByRole('status')).toContainText('Tag added to 2 photos.')
  await expectNoAxeViolations(page)

  await page.goto(server.url + '/admin/albums')
  await expect(page.getByText('2 photos')).toBeVisible()
  await page.getByRole('link', { name: 'Photos in Trees' }).click()
  await expect(heading(page, 'Trees')).toBeVisible()
  await expect(page.locator('.card__name')).toHaveText(['cedar.jpg', 'birch.jpg'])

  await page.goto(server.url + '/admin/albums')
  await page.getByRole('button', { name: 'Edit Trees' }).click()
  await page.getByLabel('Name').last().fill('Woodland')
  await page.getByRole('button', { name: 'Save album' }).click()
  await expect(page.getByRole('heading', { name: 'Woodland' })).toBeVisible()
  await expectNoAxeViolations(page)
})

test('a photo\'s tags and albums are set on its own page', async ({ page }) => {
  await page.goto(server.url + '/admin/photos')
  await page.getByRole('link', { name: 'Edit apple.jpg' }).click()
  await page.getByLabel('Tags').fill('Orchard, spring , orchard')
  await page.getByRole('checkbox', { name: 'Woodland' }).check()
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByLabel('Tags')).toHaveValue('Orchard, spring')
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Woodland' })).toBeChecked()
  await expectNoAxeViolations(page)
})

test('visitors browse albums and tags', async ({ page }) => {
  await page.goto(server.url + '/')
  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Albums' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Albums' })).toBeVisible()
  await expect(page.getByText('3 photos')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByRole('link', { name: /Woodland/ }).click()
  await expect(page).toHaveURL(server.url + '/album/trees')
  await expect(page.getByRole('heading', { level: 1, name: 'Woodland' })).toBeVisible()
  await expect(page.getByText('Mostly birch.')).toBeVisible()
  await expect(page.locator('.fb-tile')).toHaveCount(3)
  await expectNoAxeViolations(page)

  await page.locator('.fb-tile__link').first().click()
  await expect(page.getByText('In Woodland')).toBeVisible()
  await page.getByRole('link', { name: 'woodland', exact: true }).click()
  await expect(page).toHaveURL(server.url + '/tag/woodland')
  await expect(page.getByRole('heading', { level: 1, name: 'woodland' })).toBeVisible()
  await expect(page.locator('.fb-tile')).toHaveCount(2)
  await expectNoAxeViolations(page)

  expect((await page.goto(server.url + '/album/no-such-album'))?.status()).toBe(404)
  expect((await page.goto(server.url + '/tag/no-such-tag'))?.status()).toBe(404)
})

test('an album is deleted after confirming, and its photos remain', async ({ page }) => {
  await page.goto(server.url + '/admin/albums')
  await page.getByRole('button', { name: 'Delete Woodland' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.getByText('There are no albums yet.')).toBeVisible()
  await page.goto(server.url + '/admin/photos')
  await expect(page.locator('.card')).toHaveCount(3)
})
