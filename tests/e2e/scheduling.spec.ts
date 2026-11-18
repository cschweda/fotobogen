import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'
import { expectNoAxeViolations } from './helpers.ts'

let server: TestServer
let cookie: string
test.beforeAll(async () => {
  server = await startServer()
  cookie = await completeSetup(server)
  await upload(server, cookie, await imageBuffer({ seed: 1, width: 400, height: 300 }), 'harbour.jpg')
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })

test('a photo is scheduled for later from its page, and new uploads can be made drafts', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await page.getByRole('link', { name: 'Edit harbour.jpg' }).click()

  await expect(page.getByRole('radio', { name: 'Public: shown on your site' })).toBeChecked()
  await page.getByRole('radio', { name: 'Scheduled: public from a date and time' }).check()
  await page.getByLabel('Goes public on').fill('2099-06-01T09:30')
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status')).toContainText('Details saved.')
  // Stored as that local time; and no "View on site" link while it is not live.
  expect(query<{ publish_at: number }>(server, 'select publish_at from photos')[0]!.publish_at).toBe(new Date('2099-06-01T09:30').getTime())
  await expect(page.getByRole('link', { name: 'View on site' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('radio', { name: 'Scheduled: public from a date and time' })).toBeChecked()
  await expect(page.getByLabel('Goes public on')).toHaveValue('2099-06-01T09:30')

  await page.goto(server.url + '/admin/photos')
  await expect(page.locator('.badge', { hasText: 'Scheduled for' })).toBeVisible()
  await page.getByLabel('Show').selectOption('scheduled')
  await expect(page.locator('.card')).toHaveCount(1)
  expect((await page.goto(server.url + '/photo/harbour'))?.status()).toBe(404)

  await page.goto(server.url + '/admin/settings')
  await page.getByRole('radio', { name: 'Stay hidden as drafts until you publish them' }).check()
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toContainText('Settings saved.')
  expect(query(server, `select value from settings where key = 'uploads.default_visibility'`)).toEqual([{ value: '"hidden"' }])
})

test('choosing Scheduled without a date is refused, and the photo stays a draft', async ({ page }) => {
  // Found by the review of 18 November 2026: this used to save the photo as public.
  const id = query<{ id: string }>(server, 'select id from photos')[0]!.id
  await fetch(`${server.url}/api/admin/photos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', origin: server.url, cookie }, body: JSON.stringify({ visibility: 'hidden', publishAt: null }) })
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL(/\/admin/)
  await page.goto(`${server.url}/admin/photos/${id}`)
  await expect(page.getByRole('radio', { name: /^Hidden/ })).toBeChecked()
  await page.getByRole('radio', { name: 'Scheduled: public from a date and time' }).check()
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByText('Choose the date and time this photo goes public.')).toBeVisible()
  await expect(page.getByLabel('Goes public on')).toHaveAttribute('aria-invalid', 'true')
  expect(query(server, 'select visibility from photos')).toEqual([{ visibility: 'hidden' }])
})

test('leaving a photo with changes that are not saved asks first', async ({ page }) => {
  const id = query<{ id: string }>(server, 'select id from photos')[0]!.id
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL(/\/admin/)
  await page.goto(`${server.url}/admin/photos/${id}`)
  await page.getByLabel('Title').fill('Harbour at dawn')

  const asked: string[] = []
  page.once('dialog', (dialog) => { asked.push(dialog.message()); void dialog.dismiss() })
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  expect(asked).toEqual(['You have changes on this page that are not saved. Leave without saving them?'])
  await expect(page).toHaveURL(`${server.url}/admin/photos/${id}`)
  await expect(page.getByLabel('Title')).toHaveValue('Harbour at dawn')

  // Once saved, nothing is asked.
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('status')).toContainText('Details saved.')
  page.once('dialog', dialog => { asked.push(dialog.message()); void dialog.accept() })
  await page.getByRole('link', { name: 'Library', exact: true }).click()
  await expect(page).toHaveURL(server.url + '/admin/photos')
  expect(asked).toHaveLength(1)
})
