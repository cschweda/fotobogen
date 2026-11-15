// On a demo site a visitor logs in as demo / demo, looks round the admin,
// and is told plainly that nothing can be changed.
import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer({ env: { DEMO_MODE: '1' } })
  const cookie = await completeSetup(server)
  await upload(server, cookie, await imageBuffer({ seed: 12 }), 'pier.jpg')
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })

test('a visitor enters the demo from the login page, sees the admin, and cannot change it', async ({ page }) => {
  await page.goto(server.url + '/admin')
  await expect(heading(page, 'Log in')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'This is a demonstration site' })).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByRole('button', { name: 'Look round the admin' }).click()
  await expect(heading(page, 'Overview')).toBeVisible()
  // Every page says it is a demo.
  const notice = page.getByText('Nothing can be changed, and nothing you try is saved.')
  await expect(notice).toBeVisible()
  await expectNoAxeViolations(page)

  // The pages open and show the real settings.
  await page.getByRole('link', { name: 'Site text' }).click()
  await expect(heading(page, 'Site text')).toBeVisible()
  await expect(page.getByLabel('Site title')).toHaveValue('Test Photos')
  await expect(notice).toBeVisible()

  // Saving is refused, and the page says why.
  await page.getByLabel('Site title').fill('Defaced')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('This is a demo: you can look at everything, but nothing can be changed.')
  await page.goto(server.url + '/')
  await expect(page).toHaveTitle('Test Photos')

  // The library and a photo can be looked at.
  await page.goto(server.url + '/admin/photos')
  await expect(heading(page, /Photos|Library/)).toBeVisible()
  // Parts that are kept out of the demo say so instead of breaking.
  const tokens = await page.request.get(server.url + '/api/admin/tokens')
  expect(tokens.status()).toBe(403)

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(heading(page, 'Log in')).toBeVisible()
})
