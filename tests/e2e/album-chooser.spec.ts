import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  const cookie = await completeSetup(server, { homeOrder: 'random' })
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, { method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const ids: string[] = []
  for (const [index, name] of ['rome', 'lisbon', 'cake', 'candles', 'street', 'harbour'].entries()) {
    ids.push((await (await upload(server, cookie, await imageBuffer({ seed: index + 1, width: 600, height: 400 }), `${name}.jpg`)).json() as { photo: { id: string } }).photo.id)
    await send('PATCH', `/api/admin/photos/${ids[index]}`, { alt: `A photo of ${name}` })
  }
  await whenProcessed(server, cookie)
  const travel = (await (await send('POST', '/api/admin/albums', { title: 'Travel photos' })).json() as { id: string }).id
  const birthday = (await (await send('POST', '/api/admin/albums', { title: 'Birthday photos' })).json() as { id: string }).id
  await send('POST', '/api/admin/photos/bulk', { ids: ids.slice(0, 2), action: 'add-to-album', album: travel })
  await send('POST', '/api/admin/photos/bulk', { ids: ids.slice(2, 4), action: 'add-to-album', album: birthday })
})
test.afterAll(() => server.stop())

const shown = (page: import('@playwright/test').Page) => page.locator('.fb-tile__link').evaluateAll(links => links.map(link => link.getAttribute('href')!.replace('/photo/', '')).sort())

test('a visitor chooses an album on the front page and sees it alone; All brings everything back', async ({ page }) => {
  await page.goto(server.url + '/')
  const chooser = page.getByRole('navigation', { name: 'Choose an album' })
  await expect(chooser.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page')
  expect(await shown(page)).toEqual(['cake', 'candles', 'harbour', 'lisbon', 'rome', 'street'])
  await expectNoAxeViolations(page)

  await chooser.getByRole('link', { name: 'Travel photos' }).click()
  await expect(page).toHaveURL(server.url + '/?album=travel-photos')
  await expect(chooser.getByRole('link', { name: 'Travel photos' })).toHaveAttribute('aria-current', 'page')
  await expect.poll(() => shown(page)).toEqual(['lisbon', 'rome'])
  await expect(page).toHaveTitle(/Travel photos/)
  await expectNoAxeViolations(page)

  await chooser.getByRole('link', { name: 'Birthday photos' }).click()
  await expect.poll(() => shown(page)).toEqual(['cake', 'candles'])
  await chooser.getByRole('link', { name: 'All' }).click()
  await expect(page).toHaveURL(server.url + '/')
  await expect.poll(async () => (await shown(page)).length).toBe(6)

  // The chosen album's address works when opened afresh, on a phone, and in light mode.
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(server.url + '/?album=birthday-photos')
  await expect.poll(() => shown(page)).toEqual(['cake', 'candles'])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Light mode' }).click()
  await expectNoAxeViolations(page)
})

test('choosing an album works with JavaScript switched off', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(server.url + '/')
  await page.getByRole('navigation', { name: 'Choose an album' }).getByRole('link', { name: 'Travel photos' }).click()
  await expect(page).toHaveURL(server.url + '/?album=travel-photos')
  expect(await shown(page)).toEqual(['lisbon', 'rome'])
  await context.close()
})

test('the owner takes an album off the front page, and sets the order, in the admin', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Albums' }).click()
  await expect(page.getByText('2 photos, on the front page')).toHaveCount(2)
  await page.getByRole('button', { name: 'Edit Birthday photos' }).click()
  await expect(page.getByRole('checkbox', { name: 'Offer it on the front page' })).toBeChecked()
  await expectNoAxeViolations(page)
  await page.getByRole('checkbox', { name: 'Offer it on the front page' }).uncheck()
  await page.getByRole('button', { name: 'Save album' }).click()
  await expect(page.getByText('2 photos, on the front page')).toHaveCount(1)
  expect(await (await fetch(server.url + '/api/site')).json()).toMatchObject({ frontAlbums: [{ slug: 'travel-photos' }] })

  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('radio', { name: 'Shuffled: a new order for each visit' })).toBeChecked()
  await page.getByRole('radio', { name: 'The order of your library', exact: true }).check()
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => (await (await fetch(server.url + '/api/site')).json() as { homeOrder: string }).homeOrder).toBe('sequence')
})
