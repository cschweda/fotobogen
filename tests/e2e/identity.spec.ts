// The owner gives the site an icon and a logo from the admin.
import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
let cookie: string
test.beforeAll(async () => {
  server = await startServer()
  cookie = await completeSetup(server)
})
test.afterAll(async () => { await server.stop() })
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookie.split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name: name!, value: rest.join('='), url: server.url }
  }))
})

test('an icon and a logo are uploaded, previewed, shown on the site in the right mode, and removed', async ({ page }) => {
  await page.goto(server.url + '/admin')
  await page.getByRole('link', { name: 'Icon and logo' }).click()
  await expect(heading(page, 'Icon and logo')).toBeVisible()
  await expect(page.getByText('No icon yet.')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByLabel('Choose an icon').setInputFiles({ name: 'mark.png', mimeType: 'image/png', buffer: await imageBuffer({ width: 512, height: 512, format: 'png', seed: 2 }) })
  await expect(page.locator('p.status')).toHaveText('The icon is set. Your site shows it now.')
  await expect(page.getByAltText('Your icon as it appears in a browser tab')).toBeVisible()

  // One logo is used for both modes until a second is given.
  await page.getByLabel('Choose a logo for light mode').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await imageBuffer({ width: 600, height: 200, format: 'png', seed: 7 }) })
  await expect(page.locator('p.status')).toHaveText('The logo for light mode is set. Your site shows it now.')
  await expect(page.getByText('Using the light-mode logo, because none is set for this mode.')).toBeVisible()
  await page.getByLabel('Choose a logo for dark mode').setInputFiles({ name: 'logo-dark.png', mimeType: 'image/png', buffer: await imageBuffer({ width: 600, height: 200, format: 'png', seed: 9 }) })
  await expect(page.locator('p.status')).toHaveText('The logo for dark mode is set. Your site shows it now.')
  await page.getByLabel('How tall the logo is shown').fill('60')
  await page.getByRole('button', { name: 'Save size' }).click()
  await expect(page.locator('p.status')).toHaveText('The logo is shown 60 pixels tall.')
  await expectNoAxeViolations(page)

  // A file that is not a picture is refused with the reason, and nothing changes.
  await page.getByLabel('Replace the icon').setInputFiles({ name: 'mark.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
  await expect(page.getByRole('alert')).toHaveText('Use a PNG, JPEG, or WebP picture. (SVG files are not accepted.)')

  // On the site: the logo stands in for the name, and the one for the mode in use is shown.
  await page.goto(server.url + '/')
  const logo = page.getByRole('link', { name: 'Test Photos' }).getByRole('img')
  await expect(logo).toHaveCount(1)
  await expect(logo).toHaveAttribute('src', /logo-dark\.png/)
  expect(await logo.evaluate(image => [image.clientWidth, image.clientHeight])).toEqual([180, 60])
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', /\/brand\/icon-32\.png\?v=/)
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Light mode' }).click()
  await expect(page.getByRole('link', { name: 'Test Photos' }).getByRole('img')).toHaveAttribute('src', /logo-light\.png/)
  await expectNoAxeViolations(page)

  // Removing both logos brings the name back as text.
  await page.goto(server.url + '/admin/identity')
  // One at a time: each is confirmed before the next.
  await page.getByRole('button', { name: 'Remove the logo for light mode' }).click()
  await expect(page.locator('p.status')).toHaveText('The logo for light mode is removed.')
  await page.getByRole('button', { name: 'Remove the logo for dark mode' }).click()
  await expect(page.locator('p.status')).toHaveText('The logo for dark mode is removed.')
  await page.getByRole('button', { name: 'Remove the icon' }).click()
  await expect(page.locator('p.status')).toHaveText('The icon is removed.')
  await expect(page.getByText('No icon yet.')).toBeVisible()
  await page.goto(server.url + '/')
  await expect(page.getByRole('link', { name: 'Test Photos' }).getByRole('img')).toHaveCount(0)
  await expect(page.locator('link[rel="icon"]')).toHaveCount(0)
})
