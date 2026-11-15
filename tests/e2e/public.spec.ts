import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
let cookie: string
test.beforeAll(async () => {
  server = await startServer()
  cookie = await completeSetup(server, { photoView: 'modal', grid: 'masonry' })
  for (const [seed, name, width, height] of [[1, 'harbour.jpg', 900, 600], [2, 'tower.jpg', 600, 900], [3, 'field.jpg', 1200, 400]] as const) {
    await upload(server, cookie, await imageBuffer({ seed, width, height }), name)
  }
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })
test.describe.configure({ mode: 'serial' })

const setting = (body: Record<string, unknown>) => fetch(server.url + '/api/admin/skins', {
  method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
})

test('the grid shows the photos, with no layout shift and no accessibility problems', async ({ page }) => {
  await page.goto(server.url + '/')
  await expect(page).toHaveTitle('Test Photos')
  const tiles = page.locator('.fb-tile')
  await expect(tiles).toHaveCount(3)
  // Every image has loaded and fills the space its tile reserved for it.
  for (const tile of await tiles.all()) {
    const image = tile.locator('img')
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    const [box, inner] = [await tile.boundingBox(), await image.boundingBox()]
    expect(Math.abs(box!.width - inner!.width)).toBeLessThan(1)
  }
  // Masonry: the tall photo's tile is much taller than the wide one's.
  const heights = await tiles.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
  expect(heights[1]!).toBeGreaterThan(heights[0]! * 3)
  await expectNoAxeViolations(page)
})

test('a photo opens over the grid, can be worked by keyboard, and closing returns to the same tile', async ({ page }) => {
  await page.goto(server.url + '/')
  const first = page.locator('.fb-tile__link').first()
  await first.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(server.url + '/photo/field')
  await expect(dialog.locator('.fb-photo__image')).toBeVisible()
  await expectNoAxeViolations(page)

  // Arrow keys move between photos without leaving the modal.
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(server.url + '/photo/tower')
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(server.url + '/photo/field')

  // While it is open the page behind cannot be reached: Tab moves through
  // the modal (and out to the browser's own controls), never to the grid.
  for (let presses = 0; presses < 6; presses++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement?.closest('dialog') !== null)).toBe(true)
  }
  expect(await page.evaluate(() => document.querySelector('.fb-grid')!.matches(':not(dialog *)') && document.querySelector('dialog')!.matches(':modal'))).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(server.url + '/')
  await expect(first).toBeFocused()

  // The browser's Back button closes it too.
  await first.click()
  await expect(dialog).toBeVisible()
  await page.goBack()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(server.url + '/')
})

test('the photo page stands on its own, with neighbours and arrow keys', async ({ page }) => {
  await page.goto(server.url + '/photo/tower')
  await expect(page.locator('.fb-photo__image')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/photo/field')
  await expect(page.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/photo/harbour')
  await expectNoAxeViolations(page)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(server.url + '/photo/harbour')
  await page.getByRole('link', { name: 'All photos' }).click()
  await expect(page).toHaveURL(server.url + '/')

  const missing = await page.goto(server.url + '/photo/no-such-photo')
  expect(missing?.status()).toBe(404)
})

test('everything works with JavaScript switched off', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(server.url + '/')
  await expect(page.locator('.fb-tile')).toHaveCount(3)
  // The grid is laid out by CSS alone.
  const heights = await page.locator('.fb-tile').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
  expect(heights[1]!).toBeGreaterThan(heights[0]! * 3)
  await page.locator('.fb-tile__link').first().click()
  await expect(page).toHaveURL(server.url + '/photo/field')
  await expect(page.locator('.fb-photo__image')).toBeVisible()
  await page.getByRole('link', { name: 'Next' }).click()
  await expect(page).toHaveURL(server.url + '/photo/tower')
  await context.close()
})

test('skins and their options are changed from the admin and show at once', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('link', { name: 'Skins' }).click()
  await expect(heading(page, 'Skins')).toBeVisible()
  await expect(page.getByRole('radio', { name: /Swiss/ })).toBeChecked()
  await expectNoAxeViolations(page)

  await page.getByLabel('Columns on a wide screen').fill('2')
  await page.getByLabel('Space between photos').selectOption('wide')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved. Your site now uses Swiss.').first()).toBeVisible()

  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto(server.url + '/')
  const columns = await page.locator('.fb-grid').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(2)
  await setting({ active: 'swiss', options: {} })
})

test('a site set to open photos on their own page uses plain links, and the square grid has equal cells', async ({ page }) => {
  const db = (await import('better-sqlite3')).default
  const { join } = await import('node:path')
  const sqlite = new db(join(server.dataDir, 'fotobogen.db'))
  sqlite.exec(`update settings set value = '"page"' where key = 'layout.photo_view'; update settings set value = '"square"' where key = 'layout.grid'`)
  sqlite.close()
  await page.goto(server.url + '/')
  const boxes = await page.locator('.fb-tile').evaluateAll(elements => elements.map((element) => {
    const box = element.getBoundingClientRect()
    return Math.round(box.width) === Math.round(box.height)
  }))
  expect(boxes).toEqual([true, true, true])
  await page.locator('.fb-tile__link').first().click()
  await expect(page).toHaveURL(server.url + '/photo/field')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('link', { name: 'All photos' })).toBeVisible()
  await expectNoAxeViolations(page)
})
