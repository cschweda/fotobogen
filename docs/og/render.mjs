// Renders docs/og/og.html to site/og.png at 1200 x 630.
//   node docs/og/render.mjs
import { chromium } from '@playwright/test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const source = fileURLToPath(new URL('./og.html', import.meta.url))
const target = fileURLToPath(new URL('../../site/og.png', import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(source).href)
await page.screenshot({ path: target })
await browser.close()
console.log(`Wrote ${target}`)
