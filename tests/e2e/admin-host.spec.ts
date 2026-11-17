// The admin at an address of its own, in a real browser, with a hostile
// counting script on the public pages trying to reach it.
//
// The two addresses are photos.fb.localhost and admin.fb.localhost: names the
// browser itself takes to mean this machine, and which, like
// photos.example.com and admin.photos.example.com, it counts as one "site"
// but two origins. That is the arrangement a real installation has.
import { expect, test } from '@playwright/test'
import { request as httpRequest } from 'node:http'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, setupAnswers } from '../helpers/setup.ts'
import { heading } from './helpers.ts'

let server: TestServer
let port: string
let siteUrl: string
let adminUrl: string
let cookie: string

/** A request to the server under one of its names. (Only the browser knows these names; this goes to 127.0.0.1 and says which name it means.) */
function send(origin: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number, json: unknown, cookie: string | undefined }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, method, path, headers: { 'host': new URL(origin).host, origin, 'content-type': 'application/json', ...headers } }, (response) => {
      let text = ''
      response.on('data', chunk => { text += chunk })
      response.on('end', () => {
        let json: unknown = null
        try { json = JSON.parse(text) }
        catch { /* not JSON */ }
        resolve({ status: response.statusCode ?? 0, json, cookie: response.headers['set-cookie']?.[0]?.split(';')[0] })
      })
    })
    request.on('error', reject)
    request.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

test.beforeAll(async () => {
  server = await startServer({ env: p => ({ SITE_URL: `http://photos.fb.localhost:${p}`, ADMIN_HOST: `admin.fb.localhost:${p}` }) })
  port = new URL(server.url).port
  siteUrl = `http://photos.fb.localhost:${port}`
  adminUrl = `http://admin.fb.localhost:${port}`
  const setup = await send(adminUrl, 'POST', '/api/setup/complete', setupAnswers(server))
  expect(setup.status).toBe(200)
  cookie = setup.cookie!
  await send(adminUrl, 'POST', '/api/admin/acknowledge', undefined, { cookie })
  const saved = await send(adminUrl, 'PUT', '/api/admin/stats', { provider: 'other', otherScript: 'https://stats.example/count.js' }, { cookie })
  expect(saved.status).toBe(200)
})
test.afterAll(() => server.stop())

test('a script on a public page cannot reach the admin, even in the browser where the owner is logged in', async ({ page }) => {
  // The "counting service" has turned hostile: its script tries every way it has to use the owner's login.
  await page.route('https://stats.example/**', route => route.fulfill({
    contentType: 'text/javascript',
    body: `(async () => {
      const admin = ${JSON.stringify(adminUrl)}
      const found = {}
      found.sameAddress = (await fetch('/api/admin/settings')).status
      found.read = await fetch(admin + '/api/admin/settings', { credentials: 'include' }).then(r => r.status, () => 'blocked')
      found.change = await fetch(admin + '/api/admin/tokens', { method: 'POST', credentials: 'include', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ name: 'planted', scope: 'manage' }) }).then(r => r.type, () => 'blocked')
      found.logout = await fetch(admin + '/api/auth/logout', { method: 'POST', credentials: 'include', mode: 'no-cors' }).then(r => r.type, () => 'blocked')
      const frame = document.createElement('iframe')
      frame.src = admin + '/admin'
      document.body.append(frame)
      await new Promise(done => setTimeout(done, 500))
      try { found.frame = frame.contentDocument ? frame.contentDocument.body.innerText.length : 'unreadable' }
      catch { found.frame = 'unreadable' }
      window.__found = found
    })()`,
  }))

  // The owner logs in, at the admin's address.
  await page.goto(adminUrl + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(heading(page, 'Overview')).toBeVisible()

  // "View your site" leads to the public address, where the hostile script runs. The owner is still logged in, next door.
  await page.getByRole('navigation').getByRole('link', { name: 'View your site' }).click()
  await page.waitForURL(siteUrl + '/')
  await expect(page.locator('script[data-fb-stats]')).toHaveCount(1)
  const found = await page.waitForFunction(() => (window as unknown as { __found?: Record<string, unknown> }).__found).then(handle => handle.jsonValue())
  expect(found).toEqual({
    sameAddress: 404, // the admin's API does not exist at the public address
    read: 'blocked', // the browser will not let it read from the admin's address
    change: 'blocked', // nor even send there blind: the page may talk to its own address and the counting service only
    logout: 'blocked',
    frame: 'unreadable', // and the admin will not appear in a frame
  })
  // Nothing was changed: no token was made, and the owner is still logged in.
  const tokens = await send(adminUrl, 'GET', '/api/admin/tokens', undefined, { cookie })
  expect(tokens.status).toBe(200)
  expect(JSON.stringify(tokens.json)).not.toContain('planted')
  await page.goto(adminUrl + '/admin')
  await expect(heading(page, 'Overview')).toBeVisible()

  // Asking for the login at the public address leads to the admin's.
  await page.goto(siteUrl + '/login')
  await expect(page).toHaveURL(adminUrl + '/admin')
})
