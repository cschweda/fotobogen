import { expect, test } from '@playwright/test'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading, tabTo } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.stop() })

test.describe.configure({ mode: 'serial' })

test('a fresh install opens on the wizard, which names its step', async ({ page }) => {
  await page.goto(server.url)
  await expect(page).toHaveURL(server.url + '/setup')
  await expect(heading(page, 'Enter your setup token')).toBeVisible()
  await expect(page.getByText('Step 1 of 6')).toBeVisible()
  await expect(page).toHaveTitle(/Step 1 of 6/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expectNoAxeViolations(page)
})

test('a wrong token is announced and tied to its field', async ({ page }) => {
  await page.goto(server.url + '/setup')
  const token = page.getByLabel('Setup token')
  await token.fill('not-the-token')
  await token.press('Enter')
  await expect(page.getByRole('alert')).toContainText('That setup token is not correct')
  await expect(token).toHaveAttribute('aria-invalid', 'true')
  const describedBy = await token.getAttribute('aria-describedby')
  const errorId = describedBy!.split(' ').find(id => id.endsWith('-error'))!
  await expect(page.locator(`#${errorId}`)).toContainText('That setup token is not correct')
  await expect(token).toBeFocused()
  await expect(heading(page, 'Enter your setup token')).toBeVisible()
  await expectNoAxeViolations(page)
})

test('the whole wizard can be completed with the keyboard alone', async ({ page }) => {
  await page.goto(server.url + '/setup')

  // Step 1
  await tabTo(page, page.getByLabel('Setup token'))
  await page.keyboard.type(server.token()!)
  await page.keyboard.press('Enter')

  // Step 2: focus moves to the new step's heading
  await expect(heading(page, 'Name your site')).toBeFocused()
  await expect(page).toHaveTitle(/Step 2 of 6/)
  await expectNoAxeViolations(page)
  await tabTo(page, page.getByLabel('Site title'))
  await page.keyboard.press('Enter') // empty title
  await expect(page.getByLabel('Site title')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('Enter a title for your site.')
  await page.keyboard.type('Kodachrome Days')
  await tabTo(page, page.getByLabel('Tagline (optional)'))
  await page.keyboard.type('Slides from the shoebox')
  await page.keyboard.press('Enter')

  // Step 3: a short password is refused, with the error tied to the field
  await expect(heading(page, 'Create the admin account')).toBeFocused()
  await expectNoAxeViolations(page)
  await tabTo(page, page.getByLabel('Username'))
  await page.keyboard.type(ADMIN.username)
  const password = page.getByLabel('Password', { exact: true })
  await tabTo(page, password)
  await page.keyboard.type('elevenchars')
  await expect(page.getByText('Strength: Too short')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('Use at least 12 characters.')
  await expect(password).toBeFocused()
  await password.press('ControlOrMeta+a')
  await page.keyboard.type(ADMIN.password)
  await expect(page.getByText(/Strength: (Fair|Good|Strong)/)).toBeVisible()
  await page.keyboard.press('Enter')

  // Step 4: radio groups work with arrow keys
  await expect(heading(page, 'Choose how photos are shown')).toBeFocused()
  await expectNoAxeViolations(page)
  await expect(page.getByRole('radio', { name: /Masonry/ })).toBeChecked()
  await tabTo(page, page.getByRole('radio', { name: /Masonry/ }))
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: /Square/ })).toBeChecked()
  await tabTo(page, page.getByRole('radio', { name: /Modal/ }))
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: /Page/ })).toBeChecked()
  await tabTo(page, page.getByRole('button', { name: 'Continue' }))
  await page.keyboard.press('Enter')

  // Step 5: starting empty is the default; downloading samples is the option
  await expect(heading(page, 'Start with sample photos?')).toBeFocused()
  await expectNoAxeViolations(page)
  await expect(page.getByRole('radio', { name: /Start empty/ })).toBeChecked()
  await tabTo(page, page.getByRole('radio', { name: /Start empty/ }))
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: /Download 25 sample photos/ })).toBeChecked()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('radio', { name: /Start empty/ })).toBeChecked()
  await tabTo(page, page.getByRole('button', { name: 'Finish setup' }))
  await page.keyboard.press('Enter')

  // Step 6
  await expect(heading(page, 'Fotobogen is ready')).toBeFocused()
  await expect(page.getByText('Kodachrome Days')).toBeVisible()
  await expectNoAxeViolations(page)
  await tabTo(page, page.getByRole('link', { name: 'Open admin' }))
  await page.keyboard.press('Enter')

  // Logged in. First, and only once, the notice about backups: nothing else
  // in the admin opens until it is accepted.
  await expect(page).toHaveURL(server.url + '/admin/welcome')
  await expect(heading(page, 'Back up your photographs')).toBeVisible()
  await expect(page.getByText('no warranty')).toBeVisible()
  await expectNoAxeViolations(page)
  await page.goto(server.url + '/admin/upload')
  await expect(page).toHaveURL(server.url + '/admin/welcome')
  await tabTo(page, page.getByRole('button', { name: 'I understand' }))
  await page.keyboard.press('Enter')

  // Then the dashboard, and the notice does not come back.
  await expect(page).toHaveURL(server.url + '/admin')
  await expect(heading(page, 'Admin')).toBeVisible()
  await expect(page.getByText(`Signed in as ${ADMIN.username}`)).toBeVisible()
  await expect(page.getByText('Kodachrome Days')).toBeVisible()
  await expectNoAxeViolations(page)
})

test('Back keeps what was typed', async ({ page }) => {
  // Setup is complete now, so this runs against a second fresh server.
  const fresh = await startServer()
  try {
    await page.goto(fresh.url + '/setup')
    await page.getByLabel('Setup token').fill(fresh.token()!)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByLabel('Site title').fill('Remember me')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(heading(page, 'Create the admin account')).toBeFocused()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(heading(page, 'Name your site')).toBeFocused()
    await expect(page.getByLabel('Site title')).toHaveValue('Remember me')
  }
  finally { await fresh.stop() }
})

test('the wizard is gone once setup is complete', async ({ page }) => {
  const response = await page.goto(server.url + '/setup')
  expect(response!.status()).toBe(404)
  await expect(heading(page, 'Page not found')).toBeVisible()
  await expectNoAxeViolations(page)
})

test('the public site shows the site title and tagline', async ({ page }) => {
  await page.goto(server.url + '/')
  await expect(heading(page, 'Kodachrome Days')).toBeVisible()
  await expect(page.getByText('Slides from the shoebox')).toBeVisible()
  await expectNoAxeViolations(page)
})
