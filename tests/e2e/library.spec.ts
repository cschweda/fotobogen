import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
let cookie: string
test.beforeAll(async () => {
  server = await startServer()
  cookie = await completeSetup(server)
  for (const [seed, name] of [[1, 'apple.jpg'], [2, 'birch.jpg'], [3, 'cedar.jpg']] as const) {
    await upload(server, cookie, await imageBuffer({ seed, width: 600, height: 400 }), name)
  }
  await whenProcessed(server, cookie)
  await fetch(server.url + '/api/admin/modules/filmlooks', { method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: '{"enabled":true}' })
  await fetch(server.url + '/api/admin/modules/filmframe', { method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: '{"enabled":true}' })
})
test.afterAll(async () => { await server.stop() })
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(heading(page, 'Overview')).toBeVisible()
})

const names = (page: import('@playwright/test').Page) => page.locator('.card__name').allTextContents()

test('the library lists photos, flags missing alt text, and reorders from the keyboard', async ({ page }) => {
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await expect(heading(page, 'Photos')).toBeVisible()
  expect(await names(page)).toEqual(['cedar.jpg', 'birch.jpg', 'apple.jpg'])
  await expect(page.getByText('No alt text')).toHaveCount(3)
  await expectNoAxeViolations(page)

  const up = page.getByRole('button', { name: 'Up: apple.jpg' })
  await up.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => names(page)).toEqual(['cedar.jpg', 'apple.jpg', 'birch.jpg'])
  await page.getByRole('button', { name: 'To top: birch.jpg' }).click()
  await expect.poll(() => names(page)).toEqual(['birch.jpg', 'cedar.jpg', 'apple.jpg'])
  await expect(page.getByRole('button', { name: 'Up: birch.jpg' })).toBeDisabled()

  // Dragging does the same with a mouse.
  await page.locator('.card').nth(2).dragTo(page.locator('.card').nth(0))
  await expect.poll(() => names(page)).toEqual(['apple.jpg', 'birch.jpg', 'cedar.jpg'])
})

test('several photos can be hidden, shown, and deleted, with a confirmation before deleting', async ({ page }) => {
  await page.goto(server.url + '/admin/photos')
  await page.getByRole('checkbox', { name: 'birch.jpg' }).check()
  await page.getByRole('checkbox', { name: 'cedar.jpg' }).check()
  await expect(page.getByText('2 photos selected')).toBeVisible()
  await page.getByRole('button', { name: 'Hide' }).click()
  await expect(page.locator('.badge', { hasText: 'Hidden' })).toHaveCount(2)
  await expectNoAxeViolations(page)

  await page.getByLabel('Show').selectOption('hidden')
  await expect.poll(() => names(page)).toEqual(['birch.jpg', 'cedar.jpg'])
  await page.getByLabel('Show').selectOption('')

  // Still selected after hiding; show them again, then keep only cedar selected.
  await page.getByRole('button', { name: 'Show', exact: true }).click()
  await expect(page.locator('.badge', { hasText: 'Hidden' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Select all' }).click()
  await expect(page.getByText('3 photos selected')).toBeVisible()
  await page.getByRole('button', { name: 'Select none' }).click()
  await page.getByRole('checkbox', { name: 'cedar.jpg' }).check()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Delete 1 photo for good, including the files you uploaded?')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(async () => (await names(page)).length).toBe(3)
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect.poll(() => names(page)).toEqual(['apple.jpg', 'birch.jpg'])
  expect(query(server, 'select count(*) as n from photos')).toEqual([{ n: 2 }])
})

test('a photo is edited, tried in different looks from thumbnails under it, and the change reaches the site', async ({ page }) => {
  await page.goto(server.url + '/admin/photos')
  await page.getByRole('link', { name: 'Edit apple.jpg' }).click()
  await expect(heading(page, 'apple.jpg')).toBeVisible()

  await page.getByLabel('Title').fill('Apple orchard')
  await page.getByLabel('Alt text').fill('Rows of apple trees in blossom')
  await page.getByLabel('Description').fill('Late April.')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(heading(page, 'Apple orchard')).toBeVisible()

  // An address another photo has is refused, on the field itself.
  await page.getByLabel('Address').fill('birch')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByLabel('Address')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Another photo already has this address.')).toBeVisible()
  await page.getByLabel('Address').fill('apple-orchard')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByLabel('Address')).not.toHaveAttribute('aria-invalid', 'true')

  // The strip: one small preview for each look the modules offer.
  const looks = page.getByRole('list').filter({ has: page.getByRole('button', { name: 'As uploaded' }) })
  await expect(looks.getByRole('button')).toHaveCount(7) // as uploaded, five film looks, the film frame
  await expect(looks.getByRole('button', { name: 'Colour slide (Kodachrome style)' }).locator('img')).toBeVisible({ timeout: 20_000 })
  await expect(looks.getByRole('button', { name: 'Film frame: Negative edge' }).locator('img')).toBeVisible({ timeout: 20_000 })
  await expectNoAxeViolations(page)

  await looks.getByRole('button', { name: 'B&W 100, fine grain' }).click()
  await expect(looks.getByRole('button', { name: 'B&W 100, fine grain' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('radio', { name: 'Choose for this photo' })).toBeChecked()
  await expect(page.getByLabel('Look', { exact: true })).toHaveValue('B&W 100, fine grain')
  await expect(page.getByText('Preview. Not saved yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Save look' }).click()
  await expect(page.getByText('As it is now.')).toBeVisible({ timeout: 30_000 })
  expect(query<{ recipe_json: string }>(server, `select recipe_json from photos where slug = 'apple-orchard'`)[0]!.recipe_json).toContain('B&W 100, fine grain')

  await page.goto(server.url + '/photo/apple-orchard')
  await expect(page.getByRole('heading', { name: 'Apple orchard' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Rows of apple trees in blossom' })).toBeVisible()
})

test('a photo can be deleted from its own page, after confirming', async ({ page }) => {
  await page.goto(server.url + '/admin/photos')
  await page.getByRole('link', { name: 'Edit birch.jpg' }).click()
  await page.getByRole('button', { name: 'Delete photo' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page).toHaveURL(server.url + '/admin/photos')
  await expect.poll(() => names(page)).toEqual(['Apple orchard'])
})

test('settings change the site title and how photos are shown', async ({ page }) => {
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(heading(page, 'Settings')).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByLabel('Site title').fill('')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByLabel('Site title')).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Site title').fill('Orchard Days')
  await page.getByRole('radio', { name: /Square/ }).check()
  await page.getByRole('checkbox', { name: 'Show camera details' }).uncheck()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved.').first()).toBeVisible()
  await page.goto(server.url + '/')
  await expect(page).toHaveTitle('Orchard Days')
  await expect(page.locator('.fb-grid--square')).toBeVisible()
})
