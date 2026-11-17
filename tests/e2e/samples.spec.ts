import { expect, test, type Page } from '@playwright/test'
import { startFakePicsum, type FakePicsum } from '../helpers/picsum.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let picsum: FakePicsum
test.beforeAll(async () => { picsum = await startFakePicsum() })
test.afterAll(async () => { await picsum.stop() })

/** Walks the wizard to its last step, choosing to download the sample photos. */
async function setUpWithSamples(page: Page, server: TestServer) {
  await page.goto(server.url + '/setup')
  await page.getByLabel('Setup token').fill(server.token()!)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Site title').fill('Sample Site')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Username').fill('ansel')
  await page.getByLabel('Password', { exact: true }).fill('zone system forever')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('radio', { name: /Download 25 sample photos/ }).check()
  await page.getByRole('button', { name: 'Finish setup' }).click()
  await expect(heading(page, 'Fotobogen is ready')).toBeVisible()
}

test('setup shows a counter while the sample photos download, then says they are all there', async ({ page }) => {
  picsum.down = false
  picsum.slow = 120
  const server = await startServer({ env: { SAMPLES_BASE_URL: picsum.url } })
  try {
    await setUpWithSamples(page, server)
    const progress = page.getByRole('progressbar', { name: 'Sample photos downloaded' })
    await expect(progress).toBeVisible()
    await expect(page.getByText(/of 25 downloaded/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel download' })).toBeVisible()
    await expectNoAxeViolations(page)
    picsum.slow = 0
    await expect(page.getByText('All 25 sample photos are in your library.')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Remove sample photos' })).toBeVisible()
    await expectNoAxeViolations(page)
  }
  finally {
    picsum.slow = 0
    await server.stop()
  }
})

test('when the download fails, setup offers another try, and after two failures leads with skipping', async ({ page }) => {
  picsum.down = true
  const server = await startServer({ env: { SAMPLES_BASE_URL: picsum.url } })
  try {
    await setUpWithSamples(page, server)
    await expect(page.getByText(/could not be downloaded/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip sample photos' })).toBeVisible()
    await expectNoAxeViolations(page)

    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('It has now failed 2 times.')).toBeVisible({ timeout: 30_000 })
    await expectNoAxeViolations(page)

    await page.getByRole('button', { name: 'Skip sample photos' }).click()
    await expect(page.getByText('No sample photos. You can download them from the admin whenever you like.')).toBeVisible()
    // Setup itself was never held up: the admin opens.
    await page.getByRole('link', { name: 'Open admin' }).click()
    // The one-time backup notice. The press is saved before the admin opens; on a slow machine that takes a moment.
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/api/admin/acknowledge')), page.getByRole('button', { name: 'I understand' }).click()])
    await expect(heading(page, 'Overview')).toBeVisible({ timeout: 15_000 })

    // The admin can always download them later.
    picsum.down = false
    await page.getByRole('button', { name: 'Download sample photos' }).click()
    await expect(page.getByText('All 25 sample photos are in your library.')).toBeVisible({ timeout: 30_000 })
    // The button that was pressed is gone; focus stays in the section instead of jumping to the top.
    await expect(page.getByRole('heading', { name: 'Sample photos' })).toBeFocused()
    await expectNoAxeViolations(page)
    await page.getByRole('button', { name: 'Remove sample photos' }).click()
    await expect(page.getByRole('button', { name: 'Download sample photos' })).toBeVisible()
  }
  finally {
    picsum.down = false
    await server.stop()
  }
})

test('a download can be cancelled, which leaves the library empty', async ({ page }) => {
  picsum.slow = 300
  const server = await startServer({ env: { SAMPLES_BASE_URL: picsum.url } })
  try {
    await setUpWithSamples(page, server)
    await page.getByRole('button', { name: 'Cancel download' }).click()
    await expect(page.getByText('No sample photos. You can download them from the admin whenever you like.')).toBeVisible({ timeout: 15_000 })
  }
  finally {
    picsum.slow = 0
    await server.stop()
  }
})
