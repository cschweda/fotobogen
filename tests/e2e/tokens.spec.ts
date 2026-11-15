// The owner makes an API token, copies it, sees it used, and revokes it.
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

test('a token is made, shown once, works for a script, and stops working when revoked', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await context.addCookies(cookie.split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name: name!, value: rest.join('='), url: server.url }
  }))
  await page.goto(server.url + '/admin')
  await page.getByRole('link', { name: 'API tokens' }).click()
  await expect(heading(page, 'API tokens')).toBeVisible()
  await expect(page.getByText('There are no tokens.')).toBeVisible()
  await expectNoAxeViolations(page)

  // A token needs a name.
  await page.getByRole('button', { name: 'Make the token' }).click()
  await expect(page.getByText('Give the token a name that says what it is for')).toBeVisible()

  await page.getByLabel('Name').fill('Lightroom on my laptop')
  await expect(page.getByRole('radio', { name: /Upload only/ })).toBeChecked()
  await page.getByRole('button', { name: 'Make the token' }).click()
  await expect(page.getByRole('heading', { name: 'Your new token: Lightroom on my laptop' })).toBeVisible()
  const token = await page.getByLabel('Token', { exact: true }).inputValue()
  expect(token).toMatch(/^fb_[A-Za-z0-9_-]{43}$/)
  await page.getByRole('button', { name: 'Copy Token', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(token)
  await expectNoAxeViolations(page)

  // The token works the way the example on the page says.
  const form = new FormData()
  form.append('file', new Blob([await imageBuffer({ seed: 8 }) as BlobPart]), 'photo.jpg')
  expect((await fetch(`${server.url}/api/admin/photos`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form })).status).toBe(200)

  // Once dismissed it is gone for good: only its first characters remain.
  await page.getByRole('button', { name: 'I have copied it' }).click()
  await page.reload()
  await expect(page.getByText(token)).toHaveCount(0)
  const row = page.getByRole('row', { name: /Lightroom on my laptop/ })
  await expect(row).toContainText('Upload only')
  await expect(row).toContainText(`${token.slice(0, 9)}…`)
  await expect(row).not.toContainText('Never')

  // Revoking asks first, then stops the token at once.
  await row.getByRole('button', { name: 'Revoke Lightroom on my laptop' }).click()
  await row.getByRole('button', { name: 'Yes, revoke' }).click()
  await expect(page.getByText('There are no tokens.')).toBeVisible()
  expect((await fetch(`${server.url}/api/admin/photos`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401)
})
