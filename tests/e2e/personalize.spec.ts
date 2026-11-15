// The owner puts the site in their own words, sets what search engines are
// told, and copies a photo's links, all from the admin.
import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
let cookie: string
let photoId: string
test.beforeAll(async () => {
  server = await startServer()
  cookie = await completeSetup(server, { photoView: 'page' })
  const response = await upload(server, cookie, await imageBuffer({ seed: 4, width: 900, height: 600 }), 'harbour.jpg')
  photoId = (await response.json() as { photo: { id: string } }).photo.id
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })
test.describe.configure({ mode: 'serial' })
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookie.split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name: name!, value: rest.join('='), url: server.url }
  }))
})

test('the owner renames the site and rewords its pages, and visitors see it at once', async ({ page }) => {
  await page.goto(server.url + '/admin')
  await page.getByRole('link', { name: 'Site text' }).click()
  await expect(heading(page, 'Site text')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByLabel('Site title').fill('Ana Lima')
  await page.getByLabel('Language of your site\'s text').fill('pt')
  // Each field says what it is for and shows the default it would replace.
  const photos = page.getByLabel('Link to all photos')
  await expect(photos).toHaveAttribute('placeholder', 'Photos')
  await photos.fill('Fotografias')
  await page.getByLabel('A line of your own in the footer').fill('© 2026 Ana Lima')
  // Groups further down open on request.
  await page.getByText('When a page cannot be shown').click()
  await page.getByLabel('Heading when an address leads nowhere').fill('Página não encontrada')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved. Your site now uses these words.').first()).toBeVisible()
  await expect(page.getByText('3 pieces of text have your own wording.')).toBeVisible()

  await page.goto(server.url + '/')
  await expect(page).toHaveTitle('Ana Lima')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt')
  await expect(page.getByRole('link', { name: 'Fotografias' })).toBeVisible()
  await expect(page.getByText('© 2026 Ana Lima')).toBeVisible()
  await expect(page.getByText('Fotobogen')).toHaveCount(0)
  await expectNoAxeViolations(page)

  // An address that leads nowhere answers in the site's own frame and words.
  await page.goto(server.url + '/no-such-page')
  await expect(heading(page, 'Página não encontrada')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ana Lima' })).toBeVisible()
  await expect(page.getByText('Fotobogen')).toHaveCount(0)
  await expectNoAxeViolations(page)

  // One button puts every field back.
  await page.goto(server.url + '/admin/text')
  await page.getByRole('button', { name: 'Use the default wording everywhere' }).click()
  await page.getByLabel('Language of your site\'s text').fill('en')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Nothing has been changed yet.')).toBeVisible()
  await page.goto(server.url + '/')
  await expect(page.getByRole('link', { name: 'Photos', exact: true })).toBeVisible()
})

test('the owner sets what search engines and shared links show, with a preview', async ({ page }) => {
  await page.goto(server.url + '/admin')
  await page.getByRole('link', { name: 'Search and sharing' }).click()
  await expect(heading(page, 'Search and sharing')).toBeVisible()
  await expectNoAxeViolations(page)

  // The preview follows the fields as they are typed.
  await page.getByLabel('Title of your home page (optional)').fill('Ana Lima, photographer in Porto')
  await page.getByLabel('Description of your site (optional)').fill('Street photographs of Porto, on film.')
  const result = page.locator('.result').first()
  await expect(result).toContainText('Ana Lima, photographer in Porto')
  await expect(result).toContainText('Street photographs of Porto, on film.')
  await page.getByLabel('How the titles of other pages are written').selectOption({ label: 'Ana Lima: Harbour at dawn' })
  await page.getByLabel('Let search engines list this site').uncheck()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/^Saved\. Search engines/).first()).toBeVisible()

  await page.goto(server.url + '/')
  await expect(page).toHaveTitle('Ana Lima, photographer in Porto')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Street photographs of Porto, on film.')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  await page.goto(server.url + '/photo/harbour')
  await expect(page).toHaveTitle('Ana Lima: Untitled')

  // A wrong value is explained beside its field, and nothing is saved.
  await page.goto(server.url + '/admin/seo')
  await page.getByLabel('Your site\'s proper address (optional)').fill('photos.example.com')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Write the address in full, like https://photos.example.com')).toBeVisible()
  await expectNoAxeViolations(page)
})

test('a photo\'s page in the admin gives its links to copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`${server.url}/admin/photos/${photoId}`)
  await expect(page.getByRole('heading', { name: 'Links' })).toBeVisible()
  await expect(page.getByLabel('This photo\'s page')).toHaveValue(`${server.url}/photo/harbour`)
  await expect(page.getByLabel(/^Medium picture, 900 × 600 pixels/)).toHaveValue(new RegExp(`^${server.url}/media/.+-medium-.+\\.webp$`))
  await expect(page.getByLabel('HTML that shows the photo and links to its page')).toHaveValue(new RegExp(`^<a href="${server.url}/photo/harbour"><img src=".+" width="900" height="600" alt=""></a>$`))

  await page.getByRole('button', { name: 'Copy This photo\'s page' }).click()
  await expect(page.getByText('Copied.')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${server.url}/photo/harbour`)
  await expectNoAxeViolations(page)
})
