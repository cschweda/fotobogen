import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let receiver: Server
let receiverUrl = ''
let server: TestServer
test.beforeAll(async () => {
  receiver = createServer((_request, response) => response.writeHead(204).end())
  await new Promise<void>(listening => receiver.listen(0, '127.0.0.1', listening))
  receiverUrl = `http://127.0.0.1:${(receiver.address() as { port: number }).port}/hook`
  server = await startServer({ env: { WEBHOOKS_ALLOW_PRIVATE: '1' } })
  await completeSetup(server)
})
test.afterAll(async () => {
  await server.stop()
  await new Promise(closed => receiver.close(closed))
})

test('a webhook is added, shows its secret once, is tested, and deleted', async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('link', { name: 'Webhooks' }).click()
  await expect(heading(page, 'Webhooks')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByLabel('Address to call').fill('not an address')
  await page.getByRole('button', { name: 'Add webhook' }).click()
  await expect(page.getByLabel('Address to call')).toHaveAttribute('aria-invalid', 'true')

  await page.getByLabel('Address to call').fill(receiverUrl)
  await page.getByRole('checkbox', { name: 'A photo is deleted' }).check()
  await page.getByRole('button', { name: 'Add webhook' }).click()
  await expect(page.getByText(`Secret for ${receiverUrl}`)).toBeVisible()
  await expect(page.getByText('A photo goes live on the site; A photo is deleted')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByRole('button', { name: `Send a test to ${receiverUrl}` }).click()
  await expect(page.getByText(/Last message \(test\): Answered 204/)).toBeVisible()

  await page.reload()
  await expect(page.getByText('Secret for')).toHaveCount(0) // shown only once
  await page.getByRole('button', { name: `Delete the webhook for ${receiverUrl}` }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.getByText('There are no webhooks yet.')).toBeVisible()
})
