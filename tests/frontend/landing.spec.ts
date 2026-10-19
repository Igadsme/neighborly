import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/listings**', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/v1/categories', (route) => route.fulfill({ json: [] }))
  await page.goto('/')
  await expect(page.getByText('Neighborly', { exact: true }).first()).toBeVisible()
})

test('public landing page has no critical accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([])
})

test('primary navigation is keyboard reachable', async ({ page }) => {
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
})

test('responsive layout remains within the viewport', async ({ page }) => {
  const viewport = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
  expect(viewport.width).toBeLessThanOrEqual(viewport.innerWidth + 1)
})
