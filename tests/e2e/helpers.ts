import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'

/** Press Tab until the element has focus, proving it is reachable by keyboard. */
export async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 40; presses++) {
    if (await target.evaluate(el => el === document.activeElement).catch(() => false)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Could not reach ${target} with the Tab key`)
}

/** WCAG 2.2 AA, checked with axe. */
export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations.map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target).join(', ')})`)).toEqual([])
}

export const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name })
