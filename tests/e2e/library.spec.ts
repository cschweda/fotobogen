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

test('the library lists photos, flags alt text that is still to be checked, and reorders from the keyboard', async ({ page }) => {
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await expect(heading(page, 'Photos')).toBeVisible()
  expect(await names(page)).toEqual(['cedar.jpg', 'birch.jpg', 'apple.jpg'])
  await expect(page.locator('.badge', { hasText: 'Alt text to check' })).toHaveCount(3)
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

test('several photos can be hidden and shown; deleting moves them to the trash, from where they are restored or deleted for good', async ({ page }) => {
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
  // Deleting asks nothing, because it can be undone: the photo goes to the trash.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => names(page)).toEqual(['apple.jpg', 'birch.jpg'])
  await expect(page.locator('.notice')).toContainText('1 photo moved to the trash, and off your site. Kept there for 30 days.')
  await expect(page.getByRole('status').first()).toContainText('1 photo moved to the trash')
  await expect(page.locator('.fb-lead')).toContainText(/^\s*2 photos,.*1 in the trash\./)
  expect(query(server, 'select count(*) as n from photos')).toEqual([{ n: 3 }]) // still there
  expect(await (await fetch(server.url + '/api/photos')).json()).toMatchObject({ total: 2 })
  await expectNoAxeViolations(page)

  // The trash: what is in it, when it goes for good, and no way to edit or reorder it.
  await page.getByRole('button', { name: 'Open the trash' }).click()
  await expect(heading(page, 'Trash')).toBeVisible()
  await expect.poll(() => names(page)).toEqual(['cedar.jpg'])
  await expect(page.locator('.badge', { hasText: 'Removed for good on' })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Edit cedar.jpg' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Up:/ })).toHaveCount(0)
  await expectNoAxeViolations(page)

  // Restored, it is back in the library and on the site.
  await page.getByRole('checkbox', { name: 'cedar.jpg' }).check()
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByText('The trash is empty.')).toBeVisible()
  await expect(page.locator('.notice')).toContainText('1 photo restored.')
  await page.getByLabel('Show').selectOption('')
  await expect.poll(async () => (await names(page)).length).toBe(3)
  await expect.poll(async () => (await (await fetch(server.url + '/api/photos')).json() as { total: number }).total).toBe(3)

  // Deleted again, and this time for good: that is asked about first, and only the trash offers it.
  await expect(page.getByRole('button', { name: 'Delete for good' })).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'cedar.jpg' }).check()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByLabel('Show').selectOption('trash')
  await page.getByRole('checkbox', { name: 'cedar.jpg' }).check()
  await page.getByRole('button', { name: 'Delete for good' }).click()
  await expect(page.getByText('Delete 1 photo for good, including the files you uploaded? This cannot be undone.')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(() => names(page)).toEqual(['cedar.jpg'])
  await page.getByRole('button', { name: 'Delete for good' }).click()
  await page.getByRole('button', { name: 'Yes, delete for good' }).click()
  await expect(page.getByText('The trash is empty.')).toBeVisible()
  expect(query(server, 'select count(*) as n from photos')).toEqual([{ n: 2 }])
  await page.getByLabel('Show').selectOption('')
  await expect.poll(() => names(page)).toEqual(['apple.jpg', 'birch.jpg'])
})

test('a photo is edited, tried in different looks from thumbnails under it, and the change reaches the site', async ({ page }) => {
  await page.goto(server.url + '/admin/photos')
  await page.getByRole('link', { name: 'Edit apple.jpg' }).click()
  await expect(heading(page, 'apple.jpg')).toBeVisible()

  // The photo arrived with alt text made from its file name, and the page says so and asks for better.
  await expect(page.getByLabel('Alt text')).toHaveValue('Apple')
  await expect(page.getByText('Fotobogen wrote this alt text itself')).toBeVisible()
  await expectNoAxeViolations(page)
  // It can be changed, never emptied.
  await page.getByLabel('Alt text').fill('')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByLabel('Alt text')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Describe the photo in a few words, for people who cannot see it.')).toBeVisible()

  await page.getByLabel('Title').fill('Apple orchard')
  await page.getByLabel('Alt text').fill('Rows of apple trees in blossom')
  await page.getByLabel('Description').fill('Late April.')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(heading(page, 'Apple orchard')).toBeVisible()
  await expect(page.getByText('Fotobogen wrote this alt text itself')).toHaveCount(0)

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

test('a photo is deleted from its own page to the trash, and the page says so', async ({ page }) => {
  await page.goto(server.url + '/admin/photos')
  await page.getByRole('link', { name: 'Edit birch.jpg' }).click()
  await expect(page.getByText('It goes to the trash: off your site at once, kept for 30 days')).toBeVisible()
  await page.getByRole('button', { name: 'Delete photo' }).click()
  await expect(page).toHaveURL(server.url + '/admin/photos')
  await expect.poll(() => names(page)).toEqual(['Apple orchard'])
  await expect(page.locator('.fb-lead')).toContainText(/^\s*1 photo,.*1 in the trash\./)
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
