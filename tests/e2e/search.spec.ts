import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  const cookie = await completeSetup(server)
  const titles: Record<string, string> = { harbour: 'Harbour at dawn', tower: 'Water tower', field: 'Field of wheat' }
  for (const [index, name] of Object.keys(titles).entries()) {
    const id = (await (await upload(server, cookie, await imageBuffer({ seed: index + 1, width: 600, height: 400 }), `${name}.jpg`)).json() as { photo: { id: string } }).photo.id
    await fetch(`${server.url}/api/admin/photos/${id}`, { method: 'PATCH', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: titles[name], alt: titles[name] }) })
  }
  await whenProcessed(server, cookie)
})
test.afterAll(() => server.stop())

test('a visitor searches from the menu and opens what is found', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss() })
  await page.goto(server.url + '/')
  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Search' }).click()
  await expect(heading(page, 'Search')).toBeVisible()
  await expect(page.getByText('Titles, descriptions, tags, and albums are searched.')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByLabel('Search the photographs').fill('water')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(server.url + '/search?q=water')
  await expect(page.locator('.fb-page-description[role="status"]')).toHaveText('1 photo found for “water”.')
  await expect(page.locator('.fb-tile')).toHaveCount(1)
  await expect(page.getByLabel('Search the photographs')).toHaveValue('water')
  await expectNoAxeViolations(page)

  // Nothing found says so; markup typed in is shown as words and runs nothing.
  await page.getByLabel('Search the photographs').fill('"><img src=x onerror=alert(1)>')
  await page.getByLabel('Search the photographs').press('Enter')
  await expect(page.locator('.fb-page-description[role="status"]')).toContainText('No photographs match “"><img src=x onerror=alert(1)>”.')
  await expect(page.locator('.fb-main img')).toHaveCount(0)
  await expectNoAxeViolations(page)

  // What is found opens like any photo.
  await page.getByLabel('Search the photographs').fill('harbour')
  await page.getByLabel('Search the photographs').press('Enter')
  await page.locator('.fb-tile__link').first().click()
  await expect(page).toHaveURL(server.url + '/photo/harbour')
  expect(dialogs).toEqual([])
})

test('search works with JavaScript switched off', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(server.url + '/search')
  await page.getByLabel('Search the photographs').fill('wheat')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(server.url + '/search?q=wheat')
  await expect(page.locator('.fb-tile')).toHaveCount(1)
  await context.close()
})
