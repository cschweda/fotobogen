// Every skin, in light and in dark, on a phone and on a wide screen:
// readable, operable by keyboard, and never wider than the screen.
import { expect, test } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, tabTo } from './helpers.ts'

let server: TestServer
let cookie: string
test.beforeAll(async () => {
  server = await startServer()
  cookie = await completeSetup(server, { photoView: 'page', grid: 'masonry' })
  for (const [seed, name, width, height] of [[1, 'harbour.jpg', 900, 600], [2, 'tower.jpg', 600, 900], [3, 'field.jpg', 1200, 400]] as const) {
    await upload(server, cookie, await imageBuffer({ seed, width, height }), name)
  }
  await whenProcessed(server, cookie)
})
test.afterAll(async () => { await server.stop() })
test.describe.configure({ mode: 'serial' })

const choose = async (body: Record<string, unknown>) => {
  const saved = await fetch(server.url + '/api/admin/skins', {
    method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ options: {}, ...body }),
  })
  expect(saved.status).toBe(200)
}
const ground = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
const GROUNDS = {
  swiss: { light: 'rgb(255, 255, 255)', dark: 'rgb(10, 10, 11)' },
  papier: { light: 'rgb(244, 241, 234)', dark: 'rgb(23, 22, 19)' },
  plakat: { light: 'rgb(255, 212, 0)', dark: 'rgb(0, 0, 0)' },
  rangefinder: { light: 'rgb(241, 241, 239)', dark: 'rgb(12, 12, 12)' },
} as const

/**
 * The contrast of every heading, link, and button label against the page,
 * measured the WCAG way from the colours the browser actually used.
 * Returns the ones below 4.5:1 (WCAG 2.1, 1.4.3), which should be none.
 */
const faintText = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const channels = (colour: string) => (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  const luminance = (colour: string) => {
    const [r, g, b] = channels(colour).map((value) => {
      const part = value / 255
      return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
    }) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const page = luminance(getComputedStyle(document.body).backgroundColor)
  const found: string[] = []
  for (const element of document.querySelectorAll<HTMLElement>('.fb-site h1, .fb-site h2, .fb-site h3, .fb-site-title, .fb-site-tagline, .fb-site a, .fb-site button, .fb-site p, .fb-site dt, .fb-site dd')) {
    if (!element.innerText.trim() || element.closest('.fb-tile') || !element.checkVisibility()) continue
    const text = luminance(getComputedStyle(element).color)
    // Text is measured against what is behind it: the element's own background if it has a solid one
    // (the Full screen button is light text on its own dark chip, whatever the page), otherwise the page.
    const own = getComputedStyle(element).backgroundColor
    const alpha = Number((own.match(/[\d.]+/g) ?? [])[3] ?? 1)
    const behind = own !== 'rgba(0, 0, 0, 0)' && alpha > 0.7 ? luminance(own) : page
    const ratio = (Math.max(text, behind) + 0.05) / (Math.min(text, behind) + 0.05)
    if (ratio < 4.5) found.push(`${element.tagName.toLowerCase()}.${element.className} "${element.innerText.trim().slice(0, 30)}" ${ratio.toFixed(1)}:1`)
  }
  return found
})

for (const skin of ['swiss', 'papier', 'plakat', 'rangefinder'] as const) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${skin} in ${mode} mode is accessible and fits a phone and a wide screen`, async ({ page }) => {
      // The look a skin may bring is left out here: this test is about the page, not the photos.
      await choose({ active: skin, mode, useLook: false })
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 800 })
        for (const path of ['/', '/photo/tower', '/slideshow']) {
          await page.goto(server.url + path)
          await expect(page.locator('html')).toHaveAttribute('data-fb-mode', mode)
          if (path !== '/slideshow') expect(await ground(page), `${path} at ${width}`).toBe(GROUNDS[skin][mode])
          // Nothing is cut off or scrolls sideways (WCAG 1.4.10, reflow).
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${path} at ${width} px scrolls sideways`).toBeLessThanOrEqual(0)
          if (path !== '/slideshow') expect(await faintText(page), `${path} at ${width}: text too faint to read`).toEqual([])
          await expectNoAxeViolations(page)
        }
      }
    })
  }
}

test('a visitor switches between light and dark, by keyboard, and the choice is remembered', async ({ page }) => {
  await choose({ active: 'swiss', mode: 'skin' })
  await page.goto(server.url + '/')
  expect(await ground(page)).toBe(GROUNDS.swiss.dark)

  // The switch names the mode it changes to.
  const toLight = page.getByRole('button', { name: 'Light mode' })
  await tabTo(page, toLight)
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-fb-mode', 'light')
  expect(await ground(page)).toBe(GROUNDS.swiss.light)
  await expect(page.getByRole('button', { name: 'Dark mode' })).toBeVisible()
  await expect(toLight).toHaveCount(0)
  await expectNoAxeViolations(page)

  // Remembered on the next page, with the right colours from the first paint.
  await page.goto(server.url + '/photo/tower')
  await expect(page.locator('html')).toHaveAttribute('data-fb-mode', 'light')
  expect(await ground(page)).toBe(GROUNDS.swiss.light)
  await page.getByRole('button', { name: 'Dark mode' }).click()
  await expect.poll(() => ground(page)).toBe(GROUNDS.swiss.dark)
})

test('a site set to follow the device shows each visitor their own mode', async ({ browser }) => {
  await choose({ active: 'papier', mode: 'auto' })
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ colorScheme })
    const page = await context.newPage()
    await page.goto(server.url + '/')
    expect(await ground(page)).toBe(GROUNDS.papier[colorScheme])
    // The switch offers the other mode, and works from there.
    await page.getByRole('button', { name: colorScheme === 'dark' ? 'Light mode' : 'Dark mode' }).click()
    await expect.poll(() => ground(page)).toBe(GROUNDS.papier[colorScheme === 'dark' ? 'light' : 'dark'])
    await context.close()
  }
  await choose({ active: 'swiss', mode: 'skin' })
})

test('the admin sets the mode visitors see first, and a colour for each mode', async ({ page }) => {
  await page.context().addCookies(cookie.split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name: name!, value: rest.join('='), url: server.url }
  }))
  await page.goto(server.url + '/admin/skins')
  await expect(page.getByLabel('Visitors first see')).toHaveValue('skin')
  await page.getByRole('radio', { name: /Papier/ }).check()
  await page.getByLabel('Visitors first see').selectOption('dark')
  await page.getByLabel('Accent colour, dark mode').fill('#00ff88')
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved. Your site now uses Papier.').first()).toBeVisible()

  await page.goto(server.url + '/')
  expect(await ground(page)).toBe(GROUNDS.papier.dark)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fb-accent').trim())).toBe('#00ff88')
  await choose({ active: 'swiss', mode: 'skin' })
})

test('a skin that brings a look says so, and the owner can take the skin with or without it', async ({ page }) => {
  const recipe = async () => (await (await fetch(server.url + '/api/admin/modules', { headers: { cookie } })).json() as { siteRecipe: { module: string }[] }).siteRecipe.map(step => step.module)
  await page.context().addCookies(cookie.split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name: name!, value: rest.join('='), url: server.url }
  }))
  await page.goto(server.url + '/admin/skins')
  // Swiss brings no look, so nothing is offered.
  await expect(page.getByLabel('Use this look for all photos')).toHaveCount(0)

  await page.getByRole('radio', { name: /Rangefinder Dreams/ }).check()
  await expect(page.getByText('Film look: B&W 400 (Tri-X style)')).toBeVisible()
  await expect(page.getByLabel('Use this look for all photos')).toBeChecked()
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/Your site now uses Rangefinder Dreams\. 3 photos are being made again/).first()).toBeVisible()
  expect(await recipe()).toEqual(['filmlooks'])
  await whenProcessed(server, cookie)

  // Unticking the box keeps the skin and drops the look.
  await page.getByLabel('Use this look for all photos').uncheck()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(recipe).toEqual([])
  await whenProcessed(server, cookie)
  await choose({ active: 'swiss', mode: 'skin' })
})
