import { expect, test } from '@playwright/test'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading, tabTo } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  await completeSetup(server)
})
test.afterAll(async () => { await server.stop() })

test('visiting /admin without a session leads to the login page', async ({ page }) => {
  await page.goto(server.url + '/admin')
  await expect(page).toHaveURL(server.url + '/login')
  await expect(heading(page, 'Log in')).toBeVisible()
  await expectNoAxeViolations(page)
})

test('a wrong password is announced, and the form can be retried', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill('not the password')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toContainText('Wrong username or password.')
  await expect(page).toHaveURL(server.url + '/login')
  await expectNoAxeViolations(page)
})

test('logging in and out works with the keyboard alone', async ({ page }) => {
  await page.goto(server.url + '/login')
  await tabTo(page, page.getByLabel('Username'))
  await page.keyboard.type(ADMIN.username)
  await tabTo(page, page.getByLabel('Password', { exact: true }))
  await page.keyboard.type(ADMIN.password)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(server.url + '/admin')
  await expect(page.getByText(`Signed in as ${ADMIN.username}`)).toBeVisible()

  await page.reload()
  await expect(heading(page, 'Overview')).toBeVisible()

  await tabTo(page, page.getByRole('button', { name: 'Log out' }))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(server.url + '/login')
  await page.goto(server.url + '/admin')
  await expect(page).toHaveURL(server.url + '/login')
})
