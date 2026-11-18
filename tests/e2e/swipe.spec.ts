// On a phone there are no arrow keys: a swipe across a photo moves to the next
// or the one before, in the photo's own page, the photo opened over the grid,
// and the slideshow.
import { expect, test, type Page } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  const cookie = await completeSetup(server, { photoView: 'modal', grid: 'masonry' })
  for (const [seed, name] of [[1, 'harbour.jpg'], [2, 'tower.jpg'], [3, 'field.jpg']] as const) await upload(server, cookie, await imageBuffer({ seed, width: 900, height: 600 }), name)
  await whenProcessed(server, cookie)
  await fetch(server.url + '/api/admin/settings', { method: 'PUT', headers: { 'content-type': 'application/json', origin: server.url, cookie }, body: JSON.stringify({ ...(await (await fetch(server.url + '/api/admin/settings', { headers: { cookie } })).json() as object), homeOrder: 'sequence' }) })
})
test.afterAll(async () => { await server.stop() })
test.use({ viewport: { width: 390, height: 800 }, hasTouch: true })

/** A finger put down on the element, moved, and lifted. */
async function swipe(page: Page, selector: string, dx: number, dy = 0, fingers = 1) {
  await page.locator(selector).first().evaluate((target, [dx, dy, fingers]) => {
    const box = target.getBoundingClientRect()
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2]
    const touch = (id: number, cx: number, cy: number) => new Touch({ identifier: id, target, clientX: cx, clientY: cy })
    const fire = (type: string, touches: Touch[], changed: Touch[]) => target.dispatchEvent(new TouchEvent(type, { touches, changedTouches: changed, bubbles: true, cancelable: true }))
    const down = Array.from({ length: fingers! }, (_, id) => touch(id, x + id * 40, y))
    fire('touchstart', down, down)
    const moved = down.map((_, id) => touch(id, x + id * 40 + dx!, y + dy!))
    fire('touchmove', moved, moved)
    fire('touchend', [], moved)
  }, [dx, dy, fingers])
}

test('a swipe across a photo on its own page goes to the next photo, and back', async ({ page }) => {
  await page.goto(server.url + '/photo/field')
  await swipe(page, '.fb-photo__figure', -120)
  await expect(page).toHaveURL(server.url + '/photo/tower')
  await swipe(page, '.fb-photo__figure', 120)
  await expect(page).toHaveURL(server.url + '/photo/field')
  // At the first photo there is nothing before it: nothing happens.
  await swipe(page, '.fb-photo__figure', 120)
  await expect(page).toHaveURL(server.url + '/photo/field')
})

test('scrolling, a small movement, and two fingers are not swipes', async ({ page }) => {
  await page.goto(server.url + '/photo/field')
  await swipe(page, '.fb-photo__figure', -120, 160) // mostly downwards: the page is being scrolled
  await swipe(page, '.fb-photo__figure', -20) // a tap that slipped
  await swipe(page, '.fb-photo__figure', -120, 0, 2) // two fingers: the picture is being enlarged
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(server.url + '/photo/field')
})

test('a swipe moves between photos opened over the grid, without leaving it', async ({ page }) => {
  await page.goto(server.url + '/')
  await page.locator('.fb-tile__link').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(server.url + '/photo/field')
  await swipe(page, 'dialog .fb-photo__figure', -120)
  await expect(page).toHaveURL(server.url + '/photo/tower')
  await expect(dialog).toBeVisible()
  await swipe(page, 'dialog .fb-photo__figure', 120)
  await expect(page).toHaveURL(server.url + '/photo/field')
})

test('a swipe moves the slideshow on and back, and does not open the details', async ({ page }) => {
  await page.goto(server.url + '/slideshow')
  await expect(page.locator('.fb-slideshow__count')).toHaveText('1 / 3')
  await swipe(page, '.fb-slideshow__photo', -120)
  await expect(page.locator('.fb-slideshow__count')).toHaveText('2 / 3')
  await swipe(page, '.fb-slideshow__photo', 120)
  await expect(page.locator('.fb-slideshow__count')).toHaveText('1 / 3')
  await expect(page.locator('.fb-slideshow__details')).toHaveCount(0)
})
