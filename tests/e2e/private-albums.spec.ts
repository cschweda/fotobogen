import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  const cookie = await completeSetup(server, { photoView: 'modal' })
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, { method, headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const ids: string[] = []
  for (const [index, name] of ['bride', 'groom', 'street'].entries()) {
    ids.push((await (await upload(server, cookie, await imageBuffer({ seed: index + 1, width: 600, height: 400 }), `${name}.jpg`)).json() as { photo: { id: string } }).photo.id)
  }
  await whenProcessed(server, cookie)
  await send('POST', '/api/admin/photos/bulk', { ids: ids.slice(0, 2), action: 'hide' })
  await send('PATCH', `/api/admin/photos/${ids[0]}`, { title: 'The bride', alt: 'A bride at a window' })
  await send('PATCH', `/api/admin/photos/${ids[1]}`, { title: 'The groom', alt: 'A groom on the steps' })
  const album = (await (await send('POST', '/api/admin/albums', { title: 'Anna and Ben' })).json() as { id: string }).id
  await send('POST', '/api/admin/photos/bulk', { ids: ids.slice(0, 2), action: 'add-to-album', album })
})
test.afterAll(() => server.stop())

test('the owner makes an album private and gives out its link; the people who have it see the album, nobody else does', async ({ page, browser }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Albums' }).click()
  await page.getByRole('button', { name: 'Edit Anna and Ben' }).click()
  await page.getByRole('radio', { name: /^Private:/ }).check()
  await page.getByRole('button', { name: 'Save album' }).click()
  const field = page.getByLabel('Link to Anna and Ben, to give to the people who may see it')
  await expect(field).toHaveValue(new RegExp(`^${server.url}/private/[A-Za-z0-9_-]{32}$`))
  await expect(page.getByText('2 photos, private')).toBeVisible()
  await expectNoAxeViolations(page)
  const link = await field.inputValue()

  // Someone with the link, not logged in.
  const client = await browser.newContext()
  const visit = await client.newPage()
  await visit.goto(link)
  await expect(heading(visit, 'Anna and Ben')).toBeVisible()
  await expect(visit.getByText('This album is private. Only people with this link can see it.')).toBeVisible()
  await expect(visit.locator('.fb-tile')).toHaveCount(2)
  await expectNoAxeViolations(visit)
  // A photo opens over the album, at an address under the album's link, and steps to the next.
  await visit.locator('.fb-tile__link').first().click()
  await expect(visit).toHaveURL(`${link}/photo/bride`)
  await expect(visit.getByRole('dialog').getByRole('heading', { name: 'The bride' })).toBeVisible()
  await visit.keyboard.press('ArrowRight')
  await expect(visit).toHaveURL(`${link}/photo/groom`)
  await expect(visit.getByRole('dialog').getByRole('heading', { name: 'The groom' })).toBeVisible()
  // The photo's own page, opened afresh, works too, and leads back to the album.
  await visit.goto(`${link}/photo/groom`)
  await expect(heading(visit, 'The groom')).toBeVisible()
  await expectNoAxeViolations(visit)
  await visit.getByRole('link', { name: 'Back to the album' }).click()
  await expect(visit).toHaveURL(link)

  // The rest of the site knows nothing of it.
  await visit.goto(server.url + '/')
  await expect(visit.locator('.fb-tile')).toHaveCount(1)
  await expect(visit.getByRole('link', { name: 'Albums' })).toHaveCount(0)
  expect((await visit.goto(server.url + '/photo/bride'))!.status()).toBe(404)

  // A new link ends the old one.
  await page.getByRole('button', { name: 'Make a new link for Anna and Ben' }).click()
  await page.getByRole('button', { name: 'Yes, make a new link' }).click()
  await expect(field).not.toHaveValue(link)
  expect((await visit.goto(link))!.status()).toBe(404)
  expect((await visit.goto(await field.inputValue()))!.status()).toBe(200)
  await client.close()
})
