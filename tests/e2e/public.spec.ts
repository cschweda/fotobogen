import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading, tabTo } from './helpers.ts'

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

  // The keys go on working when the link that had focus goes away: at the last photo there is no "Next" to hold it.
  await dialog.getByRole('link', { name: 'Next' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(server.url + '/photo/tower')
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(server.url + '/photo/harbour')
  await expect(dialog.getByRole('link', { name: 'Next' })).toHaveCount(0)
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(server.url + '/photo/tower')
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(server.url + '/photo/field')

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

test('a photo opened over the grid sits in the middle of the window, in a card that is the same for every photo', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.goto(server.url + '/')
  await page.locator('.fb-tile__link').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.fb-photo__image')).toBeVisible()
  const measure = async () => {
    await expect(dialog.locator('.fb-photo__image')).toBeVisible()
    await dialog.locator('.fb-photo__image').evaluate((image: HTMLImageElement) => image.decode().catch(() => undefined))
    const card = (await dialog.boundingBox())!
    const picture = (await dialog.locator('.fb-photo__figure').boundingBox())!
    const words = (await dialog.locator('.fb-photo__text').boundingBox())!
    return { card, picture, words, slug: new URL(page.url()).pathname, scrolls: await dialog.evaluate(element => element.scrollHeight > element.clientHeight + 1) }
  }
  const seen = [await measure()]
  // The same room on the left as on the right, and above as below.
  const { card } = seen[0]!
  expect(Math.abs(card.x - (1500 - card.x - card.width))).toBeLessThanOrEqual(2)
  expect(Math.abs(card.y - (900 - card.y - card.height))).toBeLessThanOrEqual(2)
  expect(card.x).toBeGreaterThan(10)

  // Step through photos of other shapes: wide, upright. The card does not change, nor where the words begin.
  for (let step = 0; step < 2; step++) {
    const before = seen.at(-1)!.slug
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => new URL(page.url()).pathname).not.toBe(before)
    seen.push(await measure())
  }
  expect(new Set(seen.map(one => Math.round(one.picture.width / one.picture.height * 10))).size).toBeGreaterThan(1) // really different shapes
  for (const one of seen) {
    expect(one.card, one.slug).toEqual(card)
    expect(Math.round(one.words.x), one.slug).toBe(Math.round(seen[0]!.words.x))
    expect(Math.round(one.words.y), one.slug).toBe(Math.round(seen[0]!.words.y))
    expect(one.scrolls, one.slug).toBe(false)
    // The picture is in the middle of the room left of the words, and inside the card.
    const room = { left: one.card.x, right: one.words.x }
    expect(Math.abs((one.picture.x - room.left) - (room.right - one.picture.x - one.picture.width)), one.slug).toBeLessThanOrEqual(card.width * 0.06)
    expect(one.picture.y + one.picture.height, one.slug).toBeLessThanOrEqual(card.y + card.height)
  }
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
  const saved = await fetch(server.url + '/api/admin/settings', {
    method: 'PUT',
    headers: { origin: server.url, cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ siteTitle: 'Test Photos', tagline: '', grid: 'square', photoView: 'page', showExif: true, showLocation: false }),
  })
  expect(saved.status).toBe(200)
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

test('the browser is allowed to show a photo and the slideshow full screen', async ({ page }) => {
  // Asked of the real browser, with nothing stood in: a page whose headers forbid full screen answers false.
  for (const path of ['/photo/tower', '/slideshow']) {
    await page.goto(server.url + path)
    expect(await page.evaluate(() => document.fullscreenEnabled), path).toBe(true)
  }
})

test('a photo shows its size, sits beside its words, and opens full screen from a button over it', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  // The test browser has no screen and refuses real full screen, so the browser's
  // part is stood in for: asking for full screen records which element asked and
  // announces the change, as a browser does. What is tested is the page's part.
  await page.addInitScript(() => {
    let shown: Element | null = null
    Object.defineProperty(document, 'fullscreenElement', { get: () => shown, configurable: true })
    Element.prototype.requestFullscreen = async function () {
      shown = this
      document.dispatchEvent(new Event('fullscreenchange'))
    }
    document.exitFullscreen = async () => {
      shown = null
      document.dispatchEvent(new Event('fullscreenchange'))
    }
  })
  await fetch(server.url + '/api/admin/settings', {
    method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ siteTitle: 'Test Photos', tagline: '', grid: 'masonry', photoView: 'page', showExif: true, showLocation: false }),
  })
  // An upright photo: 600 wide, 900 tall.
  await page.goto(server.url + '/photo/tower')
  const image = page.locator('.fb-photo__image')
  await expect(image).toBeVisible()

  // Every photo has a size, even one with no camera details.
  await expect(page.locator('.fb-photo__facts')).toContainText('Size')
  await expect(page.locator('.fb-photo__facts')).toContainText('600 × 900 pixels')

  // The words begin just to the right of the picture, not across the page from it.
  const picture = (await image.boundingBox())!
  const words = (await page.locator('.fb-photo__text').boundingBox())!
  expect(words.x - (picture.x + picture.width)).toBeLessThan(60)
  expect(words.x - (picture.x + picture.width)).toBeGreaterThan(10)

  // The button is over the photo: hidden until the photo is hovered or the button has focus.
  const expand = page.getByRole('button', { name: 'Full screen' })
  await expect(expand).toHaveCSS('opacity', '0')
  await image.hover()
  await expect(expand).toHaveCSS('opacity', '1')
  await expectNoAxeViolations(page)

  await expand.click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className ?? '')).toContain('fb-photo__figure')
  // The photo alone, on black, and the button now offers the way back and stays in view.
  const shrink = page.getByRole('button', { name: 'Leave full screen' })
  await expect(shrink).toHaveAttribute('aria-pressed', 'true')
  await expect(shrink).toHaveCSS('opacity', '1')
  expect(await page.locator('.fb-photo__figure').evaluate(figure => getComputedStyle(figure).backgroundColor)).toBe('rgb(0, 0, 0)')
  await shrink.click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveAttribute('aria-pressed', 'false')

  // A click on the photo itself does the same, for mouse users.
  await image.click()
  await expect(page.getByRole('button', { name: 'Leave full screen' })).toBeVisible()
  await image.click()
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible()

  // From the keyboard: the button can be reached and worked without a mouse, and shows itself when it has focus.
  await page.mouse.move(0, 0)
  await tabTo(page, page.getByRole('button', { name: 'Full screen' }))
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveCSS('opacity', '1')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Leave full screen' })).toBeVisible()
  await page.keyboard.press('Enter')

  // With camera details switched off, the size goes with them.
  await fetch(server.url + '/api/admin/settings', {
    method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ siteTitle: 'Test Photos', tagline: '', grid: 'masonry', photoView: 'page', showExif: false, showLocation: false }),
  })
  await page.goto(server.url + '/photo/tower')
  await expect(page.locator('.fb-photo__facts')).toHaveCount(0)
})
