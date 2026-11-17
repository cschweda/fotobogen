import { expect, test, type Page } from '@playwright/test'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
test.beforeAll(async () => {
  server = await startServer()
  await completeSetup(server)
})
test.afterAll(() => server.stop())

/** Stands in for a counting service: its script reports one hit back to it. Nothing leaves this machine. */
async function standIn(page: Page): Promise<{ scripts: string[], hits: string[] }> {
  const seen = { scripts: [] as string[], hits: [] as string[] }
  await page.route('https://stats.example/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/count.js')) {
      seen.scripts.push(url)
      await route.fulfill({ contentType: 'text/javascript', body: `fetch('https://stats.example/hit?site=' + document.currentScript.dataset.site, { method: 'POST' })` })
    }
    else {
      seen.hits.push(url)
      await route.fulfill({ status: 202, headers: { 'access-control-allow-origin': '*' }, body: '' })
    }
  })
  return seen
}

test('the owner chooses a counting service; visitors get its script, the owner and the admin never do', async ({ page, browser }) => {
  const own = await standIn(page)
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('link', { name: 'Visitor statistics' }).click()
  await expect(heading(page, 'Visitor statistics')).toBeVisible()
  await expect(page.getByRole('radio', { name: /^None/ })).toBeChecked()
  await expectNoAxeViolations(page)

  // Something that is not an address is refused, and says so at the field.
  await page.getByRole('radio', { name: /^Another service/ }).check()
  await page.getByLabel('Script address').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByLabel('Script address')).toHaveAttribute('aria-invalid', 'true')
  await expectNoAxeViolations(page)

  await page.getByLabel('Script address').fill('https://stats.example/count.js')
  await page.getByLabel('Name of attribute 1').fill('data-site')
  await page.getByLabel('Value of attribute 1').fill('abc123')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The script is on your public pages' })).toBeVisible()
  await expect(page.getByText('Now on your pages: Another service')).toBeVisible()

  // A visitor: the script loads, runs, and is allowed to report to its service.
  const visitor = await browser.newContext()
  const visit = await visitor.newPage()
  const blocked: string[] = []
  visit.on('console', (message) => { if (message.text().includes('Content Security Policy')) blocked.push(message.text()) })
  const theirs = await standIn(visit)
  await visit.goto(server.url + '/')
  await expect.poll(() => theirs.hits).toEqual(['https://stats.example/hit?site=abc123'])
  expect(theirs.scripts).toHaveLength(1)
  expect(blocked).toEqual([])
  // Moving on to the login from inside the page (no reload asked for) still loads it afresh, without the script.
  await visit.evaluate(() => {
    (window as unknown as { cameAlong?: boolean }).cameAlong = true
    const app = (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => void } } } } }).__vue_app__
    app.config.globalProperties.$router.push('/login')
  })
  await visit.waitForURL(/\/login$/)
  await expect(visit.getByLabel('Username')).toBeVisible()
  expect(await visit.evaluate(() => (window as unknown as { cameAlong?: boolean }).cameAlong)).toBeUndefined()
  await expect(visit.locator('script[data-fb-stats]')).toHaveCount(0)
  await visitor.close()

  // The owner, logged in, looking at their own site: no script, nothing reported.
  await page.goto(server.url + '/')
  await expect(page.locator('script[data-fb-stats]')).toHaveCount(0)
  await page.goto(server.url + '/admin')
  await expect(page.locator('script[data-fb-stats]')).toHaveCount(0)
  expect(own.scripts).toEqual([])
  expect(own.hits).toEqual([])
})

test('a public page left open in another tab loads itself again, without the script, when the owner logs in', async ({ browser }) => {
  const context = await browser.newContext()
  const left = await context.newPage()
  await standIn(left)
  await left.goto(server.url + '/')
  await expect(left.locator('script[data-fb-stats]')).toHaveCount(1)

  const login = await context.newPage()
  await login.goto(server.url + '/login')
  await login.getByLabel('Username').fill(ADMIN.username)
  await login.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await login.getByRole('button', { name: 'Log in' }).click()
  await expect(heading(login, 'Overview')).toBeVisible()

  await expect(left.locator('script[data-fb-stats]')).toHaveCount(0)
  await context.close()
})

test('a counting script never comes along into a private album, whose link its service must not learn', async ({ browser }) => {
  // Found by the third audit, of 17 November 2026. The server never puts the script on a private album's page;
  // this is the other way in: arriving there from a public page without asking the server.
  const login = await fetch(server.url + '/api/auth/login', { method: 'POST', headers: { 'origin': server.url, 'content-type': 'application/json' }, body: JSON.stringify(ADMIN) })
  const cookie = login.headers.getSetCookie()[0]!.split(';')[0]!
  const send = (method: string, path: string, body: unknown) => fetch(server.url + path, { method, headers: { 'origin': server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  await send('PUT', '/api/admin/stats', { provider: 'other', otherScript: 'https://stats.example/count.js', otherAttributes: [{ name: 'data-site', value: 'abc123' }] })
  await send('POST', '/api/admin/albums', { title: 'Clients', visibility: 'private' })
  const { albums } = await (await fetch(server.url + '/api/admin/albums', { headers: { cookie } })).json() as { albums: { privateLink: string | null }[] }
  const link = albums.find(album => album.privateLink)!.privateLink!

  const context = await browser.newContext()
  const visit = await context.newPage()
  const seen = await standIn(visit)
  await visit.goto(server.url + '/')
  await expect(visit.locator('script[data-fb-stats]')).toHaveCount(1)
  await visit.evaluate((to) => {
    const app = (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => void } } } } }).__vue_app__
    app.config.globalProperties.$router.push(to)
  }, link)
  await visit.waitForURL(new RegExp(`${link}$`))
  await expect(visit.getByText('This album is private.')).toBeVisible()
  await expect(visit.locator('script[data-fb-stats]')).toHaveCount(0)
  // Nothing was reported from the private page: one hit, from the front page.
  expect(seen.hits).toHaveLength(1)
  await context.close()
})
