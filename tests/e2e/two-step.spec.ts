import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { totpAt } from '../../server/core/totp.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
let key = ''
let codes: string[] = []
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  server = await startServer()
  await completeSetup(server)
})
test.afterAll(async () => { await server.stop() })

async function enterPassword(page: Page) {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

test('the owner switches two-step login on with an authenticator app, and is given backup codes to keep', async ({ page }) => {
  await enterPassword(page)
  await page.getByRole('link', { name: 'Two-step login' }).click()
  await expect(heading(page, 'Two-step login')).toBeVisible()
  await expect(page.getByText('Now: off. Your password alone logs in.')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByLabel('Your password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Set up two-step login' }).click()
  await expect(page.getByRole('img', { name: 'QR code to scan with your authenticator app' })).toBeVisible()
  await expect(page.getByText('Fotobogen (Test Photos)').first()).toBeVisible()
  key = (await page.getByLabel('Key to type instead of scanning').inputValue()).replace(/\s/g, '')
  expect(key).toMatch(/^[A-Z2-7]{32}$/)
  await expectNoAxeViolations(page)

  await page.getByLabel('Code from your authenticator app').fill('000000')
  await page.getByRole('button', { name: 'Switch on two-step login' }).click()
  await expect(page.getByRole('alert')).toContainText('That code is not right')
  await page.getByLabel('Code from your authenticator app').fill(totpAt(key, Date.now()))
  await page.getByRole('button', { name: 'Switch on two-step login' }).click()

  await expect(page.getByRole('status')).toContainText('Two-step login is on')
  await expect(page.getByText('Now: on.')).toBeVisible()
  const listed = page.getByRole('list', { name: 'Backup codes' }).getByRole('listitem')
  await expect(listed).toHaveCount(10)
  codes = (await listed.allTextContents()).map(text => text.trim())
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the backup codes' }).click()])
  expect(download.suggestedFilename()).toBe('fotobogen-backup-codes.txt')
  const saved = readFileSync(await download.path(), 'utf8')
  for (const code of codes) expect(saved).toContain(code)
  await expectNoAxeViolations(page)
  // Still logged in, in this browser.
  await page.reload()
  await expect(heading(page, 'Two-step login')).toBeVisible()
})

test('logging in then asks for a code, and a backup code gets in when the phone is not to hand', async ({ page }) => {
  await enterPassword(page)
  const code = page.getByLabel('Code from your authenticator app, or a backup code')
  await expect(code).toBeFocused()
  await expect(page).toHaveURL(server.url + '/login')
  await expectNoAxeViolations(page)
  await code.fill('123456')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toContainText('That code is not right')
  await code.fill(codes[0]!)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(server.url + '/admin')
})

test('the key and the backup codes can be seen again for the password, and it can be switched off', async ({ page }) => {
  await enterPassword(page)
  await page.getByLabel('Code from your authenticator app, or a backup code').fill(codes[1]!)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(server.url + '/admin')
  await page.goto(server.url + '/admin/two-step')
  await expect(page.getByText('8 of 10 backup codes are unused.')).toBeVisible()

  await page.getByLabel('Your password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Show the key and the backup codes' }).click()
  const listed = page.getByRole('list', { name: 'Backup codes' }).getByRole('listitem')
  await expect(listed).toHaveCount(10)
  await expect(listed.filter({ hasText: 'used' })).toHaveCount(2)
  await expect(page.getByLabel('Key to type instead of scanning')).toHaveValue(key.replace(/(.{4})(?=.)/g, '$1 '))
  await expectNoAxeViolations(page)

  await page.getByLabel('Your password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Make new backup codes' }).click()
  await expect(page.getByRole('status')).toContainText('new backup codes')
  await expect(listed.filter({ hasText: 'used' })).toHaveCount(0)

  await page.getByLabel('Your password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Switch off two-step login' }).click()
  await expect(page.getByText('Now: off. Your password alone logs in.')).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  // Logging out leads to the login page by itself; going there before it has would cut that short.
  await expect(page).toHaveURL(server.url + '/login')
  await enterPassword(page)
  await expect(page).toHaveURL(server.url + '/admin')
})
