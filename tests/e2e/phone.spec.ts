// Every page of the admin and every step of the wizard on a phone: nothing
// runs off the side of the screen (WCAG 1.4.10, reflow). Found wanting by
// the review of 18 November 2026 on three pages.
import { expect, test, type Page } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
test.use({ viewport: { width: 390, height: 800 } })

test('no step of the wizard scrolls sideways on a phone', async ({ page }) => {
  const server = await startServer()
  try {
    await page.goto(server.url + '/setup')
    await page.getByLabel('Setup token').fill(server.token()!)
    await page.getByLabel('Setup token').press('Enter')
    await page.getByLabel('Site title').fill('A fairly long name for a site of photographs')
    await page.getByLabel('Site title').press('Enter')
    await page.getByLabel('Username').fill(ADMIN.username)
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByLabel('Password', { exact: true }).press('Enter')
    await expect(page.getByText('Step 4 of 6')).toBeVisible()
    expect(await sideways(page), 'step 4').toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: /Continue|Next/ }).click()
    await expect(page.getByText('Step 5 of 6')).toBeVisible()
    expect(await sideways(page), 'step 5').toBeLessThanOrEqual(0)
  }
  finally { await server.stop() }
})

test('no page of the admin scrolls sideways on a phone', async ({ page }) => {
  const server = await startServer()
  try {
    const cookie = await completeSetup(server)
    const send = (method: string, path: string, body: unknown) => fetch(server.url + path, { method, headers: { 'content-type': 'application/json', origin: server.url, cookie }, body: JSON.stringify(body) })
    const uploaded = await (await upload(server, cookie, await imageBuffer({ seed: 3, width: 900, height: 600 }), 'a-photograph-with-quite-a-long-file-name-2026.jpg')).json() as { photo: { id: string } }
    await whenProcessed(server, cookie)
    const album = await (await send('POST', '/api/admin/albums', { title: 'For the family only, summer' })).json() as { id: string }
    await send('PATCH', `/api/admin/albums/${album.id}`, { visibility: 'private' })
    await send('POST', '/api/admin/tokens', { name: 'The script on my laptop', scope: 'manage' })
    await send('POST', '/api/admin/pages', { title: 'About' })

    await page.goto(server.url + '/login')
    await page.getByLabel('Username').fill(ADMIN.username)
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL(/\/admin/)
    for (const path of ['', '/upload', '/photos', `/photos/${uploaded.photo.id}`, '/albums', '/pages', '/text', '/identity', '/skins', '/seo', '/stats', '/embed', '/webhooks', '/tokens', '/two-step', '/modules', '/settings', '/system']) {
      await page.goto(`${server.url}/admin${path}`)
      await expect(page.locator('h1')).toBeVisible()
      expect(await sideways(page), `/admin${path}`).toBeLessThanOrEqual(0)
    }
  }
  finally { await server.stop() }
})
