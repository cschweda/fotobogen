import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations } from './helpers.ts'

let server: TestServer
let cookie: string
test.beforeAll(async () => {
  server = await startServer()
  cookie = await completeSetup(server)
  for (const [seed, name] of [[1, 'apple.jpg'], [2, 'birch.jpg'], [3, 'cedar.jpg']] as const) {
    await upload(server, cookie, await imageBuffer({ seed, width: 900, height: 600 }), name)
  }
  await whenProcessed(server, cookie)
  // Three seconds a photo, the shortest allowed, so the test can watch it advance.
  await fetch(server.url + '/api/admin/settings', {
    method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ siteTitle: 'Test Photos', tagline: '', grid: 'masonry', photoView: 'modal', showExif: true, showLocation: false, slideshowSeconds: 3 }),
  })
})
test.afterAll(async () => { await server.stop() })

const showing = (page: import('@playwright/test').Page) => page.locator('.fb-slideshow__image--front').getAttribute('src')

test('the slideshow advances by itself, can be paused, and is worked from the keyboard', async ({ page }) => {
  await page.goto(server.url + '/')
  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Slideshow' }).click()
  await expect(page).toHaveURL(server.url + '/slideshow')
  await expect(page.getByText('1 / 3')).toBeVisible()
  await expectNoAxeViolations(page)

  const first = await showing(page)
  // It moves on by itself...
  await expect(page.getByText('2 / 3')).toBeVisible({ timeout: 8_000 })
  expect(await showing(page)).not.toBe(first)

  // ...until it is paused.
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true')
  const held = await showing(page)
  await page.waitForTimeout(4_000)
  expect(await showing(page)).toBe(held)
  await expectNoAxeViolations(page)

  // Arrow keys step, and it goes round: after the last photo comes the first.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('3 / 3')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('1 / 3')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('3 / 3')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('3 of 3')

  // Escape leaves, back to where it was started from.
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(server.url + '/')
})

test('pressing the photo shows its details and holds it there', async ({ page }) => {
  await page.goto(server.url + '/slideshow')
  await page.getByRole('button', { name: 'Show details and hold this photo' }).click()
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open this photo\'s page' })).toBeVisible()
  await expectNoAxeViolations(page)
  const held = await showing(page)
  await page.waitForTimeout(4_000)
  expect(await showing(page)).toBe(held) // held while the details are open
  await page.getByRole('button', { name: 'Hide details and carry on' }).click()
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0)
  await expect.poll(() => showing(page), { timeout: 8_000 }).not.toBe(held)
})

test('with reduced motion the photos change without a fade', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto(server.url + '/slideshow')
  expect(await page.locator('.fb-slideshow__image--front').evaluate(image => getComputedStyle(image).transitionDuration)).toMatch(/^0(\.0+1)?s$|^1e-05s$/)
  await context.close()
})

test('an album has its own slideshow, which closes back to the album', async ({ page }) => {
  const post = (path: string, body: unknown) => fetch(server.url + path, { method: 'POST', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const album = (await (await post('/api/admin/albums', { title: 'Trees' })).json() as { id: string }).id
  const list = await (await fetch(server.url + '/api/admin/photos', { headers: { cookie } })).json() as { photos: { id: string }[] }
  await post('/api/admin/photos/bulk', { ids: list.photos.slice(0, 2).map(photo => photo.id), action: 'add-to-album', album })

  await page.goto(server.url + '/album/trees')
  await page.getByRole('link', { name: 'Play as a slideshow' }).click()
  await expect(page).toHaveURL(server.url + '/slideshow?album=trees')
  await expect(page.getByText('1 / 2')).toBeVisible()
  await page.getByRole('link', { name: 'Close' }).click()
  await expect(page).toHaveURL(server.url + '/album/trees')
})
