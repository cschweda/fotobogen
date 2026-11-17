import { expect, test } from '@playwright/test'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  await completeSetup(server)
})
test.afterAll(() => server.stop())

test('the owner writes a page and adds a link; visitors find both in the menu', async ({ page, browser }) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss() })
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Pages' }).click()
  await expect(heading(page, 'Pages')).toBeVisible()
  await expect(page.getByText('There are no pages yet.')).toBeVisible()
  await expectNoAxeViolations(page)

  // A page needs a title.
  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(page.getByLabel('Title of a new page')).toHaveAttribute('aria-invalid', 'true')

  // Adding one opens it for writing, with a preview that follows the text.
  await page.getByLabel('Title of a new page').fill('About')
  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue('about')
  await page.getByLabel('Text', { exact: true }).fill('I photograph the **coast**.\n\n## Contact\n\n- Write to me@example.com\n- <img src=x onerror=alert(1)> [x](javascript:alert(2))')
  const preview = page.locator('.preview')
  await expect(preview.getByRole('heading', { name: 'Contact' })).toBeVisible()
  await expect(preview.locator('strong')).toHaveText('coast')
  await expect(preview.getByRole('link', { name: 'me@example.com' })).toHaveAttribute('href', 'mailto:me@example.com')
  // Markup typed in stays text, and a link that could run script is not made.
  await expect(preview.locator('img')).toHaveCount(0)
  await expect(preview.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
  await expect(preview.locator('a[href^="javascript"]')).toHaveCount(0)
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save page' }).click()
  await expect(page.getByRole('status').first()).toContainText('Page "About" saved.')

  // An address the site uses is refused, at the field.
  await page.getByRole('button', { name: 'Edit About' }).click()
  await page.getByLabel('Address', { exact: true }).fill('admin')
  await page.getByRole('button', { name: 'Save page' }).click()
  await expect(page.getByLabel('Address', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('"/admin" is used by the site itself.')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  // A link of the owner's own; a bad address is refused at its row.
  await page.getByLabel('Label of link 1').fill('Shop')
  await page.getByLabel('Address of link 1').fill('javascript:alert(3)')
  await page.getByRole('button', { name: 'Save links' }).click()
  await expect(page.getByLabel('Address of link 1')).toHaveAttribute('aria-invalid', 'true')
  await expectNoAxeViolations(page)
  await page.getByLabel('Address of link 1').fill('https://shop.example.com')
  await page.getByRole('button', { name: 'Save links' }).click()
  await expect(page.getByText('Saved. The links are in your site\'s menu.')).toBeVisible()

  // A visitor: both are in the menu, the page reads as written, nothing ran.
  const visitor = await browser.newContext()
  const visit = await visitor.newPage()
  visit.on('dialog', (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss() })
  await visit.goto(server.url + '/')
  const menu = visit.getByRole('navigation', { name: 'Site' })
  await expect(menu.getByRole('link', { name: 'Shop' })).toHaveAttribute('href', 'https://shop.example.com/')
  await menu.getByRole('link', { name: 'About' }).click()
  await expect(visit).toHaveURL(server.url + '/about')
  await expect(heading(visit, 'About')).toBeVisible()
  await expect(visit.getByRole('heading', { level: 2, name: 'Contact' })).toBeVisible()
  await expect(visit.getByRole('link', { name: 'me@example.com' })).toBeVisible()
  await expect(visit.locator('.fb-page-body img')).toHaveCount(0)
  await expect(visit).toHaveTitle(/About/)
  await expectNoAxeViolations(visit)
  // The same in a light skin mode and at phone width.
  await visit.setViewportSize({ width: 390, height: 800 })
  await expectNoAxeViolations(visit)
  expect(await visit.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await visitor.close()

  // Hidden, it is gone for visitors; deleted, it is gone altogether.
  await page.getByRole('button', { name: 'Edit About' }).click()
  await page.getByRole('checkbox', { name: 'Hidden' }).check()
  await page.getByRole('button', { name: 'Save page' }).click()
  await expect(page.locator('.badge', { hasText: 'Hidden' })).toBeVisible()
  expect((await fetch(server.url + '/about')).status).toBe(404)
  await page.getByRole('button', { name: 'Edit About' }).click()
  await page.getByRole('button', { name: 'Delete page' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.getByText('There are no pages yet.')).toBeVisible()
  expect(dialogs).toEqual([])
})
