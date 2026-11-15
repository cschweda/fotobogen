import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup, query } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
let cookie: string
test.beforeAll(async () => {
  server = await startServer()
  cookie = await completeSetup(server)
  await upload(server, cookie, await imageBuffer({ seed: 41, width: 900, height: 600 }), 'pier.jpg')
  await upload(server, cookie, await imageBuffer({ seed: 42, width: 900, height: 600 }), 'ferry.jpg')
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(heading(page, 'Admin')).toBeVisible()
})

const mediumWidths = () => query<{ width: number }>(server, `select d.width from derivatives d join photos p on p.id = d.photo_id where d.kind = 'medium' order by p.original_filename`).map(row => row.width)

test('modules start switched off, and are switched on from the Modules page', async ({ page }) => {
  await page.getByRole('link', { name: 'Modules' }).click()
  await expect(heading(page, 'Modules')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Film frame' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Film looks' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'On: Film frame' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'On: Film looks' })).not.toBeChecked()
  await expect(page.getByText('No modules are switched on.')).toBeVisible()
  await expectNoAxeViolations(page)

  await page.getByRole('checkbox', { name: 'On: Film frame' }).check()
  await page.getByRole('checkbox', { name: 'On: Film looks' }).check()
  await expect(page.getByRole('checkbox', { name: 'Film looks: Film look' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Film frame: Negative edge' })).toBeVisible()
  await expectNoAxeViolations(page)
})

test('one photo can be given a frame, with a preview before saving and controls built from the module', async ({ page }) => {
  await page.getByRole('link', { name: 'Photos', exact: true }).click()
  await expect(heading(page, 'Photos')).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByRole('link', { name: 'pier.jpg' }).click()
  await expect(heading(page, 'pier.jpg')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Same as all photos' })).toBeChecked()

  await page.getByRole('radio', { name: 'Choose for this photo' }).check()
  await page.getByRole('checkbox', { name: 'Film frame: Negative edge' }).check()
  // The four controls the module declares, plus its on/off switch.
  await expect(page.getByLabel('Frame thickness')).toHaveValue('6')
  await expect(page.getByLabel('Ragged edge')).toHaveValue('60')
  await expect(page.getByRole('checkbox', { name: 'Film edge markings' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Sprocket holes (35 mm)' })).toBeChecked()
  await expect(page.getByLabel('Film stock (made up)')).toHaveValue('FOTOBOGEN 400')
  await expect(page.getByText('Preview. Not saved yet.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Preview of pier.jpg with the chosen transforms' })).toBeVisible()
  await expectNoAxeViolations(page)

  // Keyboard: the slider moves with the arrow keys.
  await page.getByLabel('Frame thickness').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByLabel('Frame thickness')).toHaveValue('6.5')
  await page.getByRole('checkbox', { name: 'Film edge markings' }).uncheck()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('As it is now.')).toBeVisible({ timeout: 30_000 })
  // Only this photo changed: 900 px plus a border and paper on each side.
  expect(mediumWidths()).toEqual([900, 900 + 2 * (39 + 20)])
})

test('a look can be applied to all photos, and a photo with its own choice keeps it', async ({ page }) => {
  await page.goto(server.url + '/admin/modules')
  await expect(page.getByRole('button', { name: 'Apply to all photos' })).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('checkbox', { name: 'Film frame: Negative edge' }).check()
  await page.getByLabel('Frame thickness').fill('10')
  await page.getByRole('button', { name: 'Apply to all photos' }).click()
  await expect(page.getByText('Saved for all photos. 1 photo is being rendered again.').first()).toBeVisible()
  await whenProcessed(server, cookie)
  // ferry.jpg follows the site (10% border); pier.jpg keeps its own (6.5%).
  expect(mediumWidths()).toEqual([900 + 2 * (60 + 30), 900 + 2 * (39 + 20)])

  // Switching the module off puts every photo back as uploaded.
  await page.getByRole('checkbox', { name: 'On: Film frame' }).uncheck()
  await expect(page.getByText('Film frame is off. 2 photos are being rendered again.').first()).toBeVisible()
  await whenProcessed(server, cookie)
  expect(mediumWidths()).toEqual([900, 900])
  await expectNoAxeViolations(page)
})
