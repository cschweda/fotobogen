import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, type Page } from '@playwright/test'
import { imageBuffer } from '../helpers/images.ts'
import { upload, whenProcessed } from '../helpers/photos.ts'
import { startServer, type TestServer } from '../helpers/server.ts'
import { ADMIN, completeSetup } from '../helpers/setup.ts'
import { expectNoAxeViolations, heading } from './helpers.ts'

let server: TestServer
let cookie: string
test.beforeAll(async () => {
  server = await startServer()
  cookie = await completeSetup(server)
  for (const [seed, name] of [[1, 'apple.jpg'], [2, 'birch.jpg'], [3, 'cedar.jpg']] as const) {
    await upload(server, cookie, await imageBuffer({ seed, width: 900, height: 600 }), name)
  }
  await whenProcessed(server, cookie)
  // Three seconds a photo, the shortest allowed, so the test can watch it advance.
  await fetch(server.url + '/api/admin/settings', {
    method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ siteTitle: 'Test Photos', tagline: '', grid: 'masonry', photoView: 'modal', showExif: true, showLocation: false, slideshowSeconds: 3 }),
  })
})
test.afterAll(async () => {
  await server.stop()
  blog?.close()
})

const switchOn = (enabled = true) => fetch(server.url + '/api/admin/embed', { method: 'PUT', headers: { origin: server.url, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) })

/**
 * Another site altogether, with this HTML as its page: a second server on this machine, at 127.0.0.1
 * where Fotobogen is at localhost, which a browser treats as a different site.
 */
let blog: Server | undefined
let blogBody = ''
async function otherSite(page: Page, body: string) {
  blogBody = body
  if (!blog) {
    blog = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<!doctype html><html lang="en"><title>A blog</title><body><h1>A blog</h1>${blogBody}</body></html>`)
    })
    await new Promise<void>(done => blog!.listen(0, '127.0.0.1', done))
  }
  await page.goto(`http://127.0.0.1:${(blog.address() as AddressInfo).port}/`)
}

test('the owner switches it on, copies the code, and another site shows the slideshow', async ({ page, browser }) => {
  await page.goto(server.url + '/login')
  await page.getByLabel('Username').fill(ADMIN.username)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('link', { name: 'Embed on another site' }).click()
  await expect(heading(page, 'Embed on another site')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Let other sites show a slideshow of your photos' })).not.toBeChecked()
  await expect(page.getByLabel('Code to paste into the other site')).toHaveCount(0)
  await expectNoAxeViolations(page)

  await page.getByRole('checkbox', { name: 'Let other sites show a slideshow of your photos' }).check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Other sites can now show your slideshow' })).toBeVisible()
  const code = await page.getByLabel('Code to paste into the other site').inputValue()
  expect(code).toBe(`<iframe src="${server.url}/embed/slideshow" width="800" height="600" style="border:0;max-width:100%;height:auto;aspect-ratio:800/600" title="Slideshow: Test Photos" loading="lazy"></iframe>`)
  // The preview on the admin page is the real thing.
  await expect(page.frameLocator('iframe[title="Preview of the slideshow"]').getByText('1 / 3')).toBeVisible()
  await expectNoAxeViolations(page)
  // A smaller size is written into the code.
  await page.getByLabel('Width, in pixels').fill('480')
  await page.getByLabel('Height, in pixels').fill('360')
  await expect(page.getByLabel('Code to paste into the other site')).toHaveValue(/width="480" height="360" style="[^"]*aspect-ratio:480\/360"/)

  // Someone else's site, in someone else's browser, with the code pasted in.
  const visitor = await browser.newContext({ viewport: { width: 1000, height: 900 } })
  const visit = await visitor.newPage()
  const refused: string[] = []
  visit.on('console', (message) => { if (/frame|Content Security Policy/i.test(message.text())) refused.push(message.text()) })
  await otherSite(visit, code)
  const frame = visit.frameLocator('iframe')
  await expect(frame.getByText('1 / 3')).toBeVisible()
  expect(refused).toEqual([])
  const box = await visit.locator('iframe').boundingBox()
  expect(Math.round(box!.width)).toBe(800)
  expect(Math.round(box!.height)).toBe(600)

  // It plays by itself until it is paused.
  const showing = () => frame.locator('.embed__image--front').getAttribute('src')
  const first = await showing()
  await expect(frame.getByText('2 / 3')).toBeVisible({ timeout: 8_000 })
  await frame.getByRole('button', { name: 'Pause' }).click()
  await expect(frame.getByRole('button', { name: 'Play' })).toBeVisible()
  const held = await showing()
  expect(held).not.toBe(first)
  await visit.waitForTimeout(4_000)
  expect(await showing()).toBe(held)

  // The five controls: first, back, play or pause, forward, last.
  await frame.getByRole('button', { name: 'Last' }).click()
  await expect(frame.getByText('3 / 3')).toBeVisible()
  await frame.getByRole('button', { name: 'First' }).click()
  await expect(frame.getByText('1 / 3')).toBeVisible()
  await frame.getByRole('button', { name: 'Next' }).click()
  await expect(frame.getByText('2 / 3')).toBeVisible()
  await frame.getByRole('button', { name: 'Previous' }).click()
  await expect(frame.getByText('1 / 3')).toBeVisible()
  await frame.getByRole('button', { name: 'Previous' }).click() // round to the end
  await expect(frame.getByText('3 / 3')).toBeVisible()
  await expect(frame.getByRole('status')).toContainText('3 of 3')
  await frame.getByRole('button', { name: 'Play' }).click()
  await expect(frame.getByText('1 / 3')).toBeVisible({ timeout: 8_000 })

  // The credit leads to fotobogen.com, and a photo to its own page, each in a new tab: the frame shows nothing else.
  const credit = frame.getByRole('link', { name: 'Powered by Fotobogen' })
  await expect(credit).toHaveAttribute('href', 'https://fotobogen.com/')
  await expect(credit).toHaveAttribute('target', '_blank')
  const [photoPage] = await Promise.all([visitor.waitForEvent('page'), frame.getByRole('link', { name: /Open this photo's page/ }).click()])
  await expect(photoPage).toHaveURL(new RegExp(`^${server.url}/photo/`))
  await photoPage.close()
  await expect(frame.getByText(/\d \/ 3/)).toBeVisible()

  // On a phone the frame shrinks to the page and keeps its shape.
  await visit.setViewportSize({ width: 400, height: 800 })
  const small = await visit.locator('iframe').boundingBox()
  expect(small!.width).toBeLessThanOrEqual(400)
  expect(small!.height / small!.width).toBeCloseTo(600 / 800, 1)
  await expect(credit).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Last' })).toBeVisible()
  await visitor.close()
})

test('on its own it meets WCAG 2.2 AA and is worked from the keyboard', async ({ page }) => {
  await switchOn()
  await page.goto(server.url + '/embed/slideshow')
  await expect(page.getByText('1 / 3')).toBeVisible()
  await expectNoAxeViolations(page)
  await page.getByRole('button', { name: 'Pause' }).click()
  await expectNoAxeViolations(page)
  await page.keyboard.press('End')
  await expect(page.getByText('3 / 3')).toBeVisible()
  await page.keyboard.press('Home')
  await expect(page.getByText('1 / 3')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('2 / 3')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('1 / 3')).toBeVisible()
})

test('another site still cannot frame any other page, nor the slideshow once it is switched off', async ({ page }) => {
  await switchOn()
  for (const path of ['/', '/slideshow', '/login', '/embed/nothing-here']) {
    await otherSite(page, `<iframe src="${server.url}${path}" title="x"></iframe>`)
    await page.waitForTimeout(500)
    const inside = page.frames().find(frame => frame !== page.mainFrame())
    expect(await inside?.locator('body').innerText().catch(() => ''), path).not.toMatch(/Test Photos|Log in|Page not found/)
  }
  await otherSite(page, `<iframe src="${server.url}/embed/slideshow" width="600" height="400" title="x"></iframe>`) // wide enough to show its count
  await expect(page.frameLocator('iframe').getByText('1 / 3')).toBeVisible()
  await switchOn(false)
  await otherSite(page, `<iframe src="${server.url}/embed/slideshow" title="x"></iframe>`)
  await expect(page.frameLocator('iframe').getByText(/\d \/ 3/)).toHaveCount(0)
  expect((await fetch(server.url + '/embed/slideshow')).status).toBe(404)
})
