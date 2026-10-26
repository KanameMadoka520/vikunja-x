import {test, expect} from '../../support/fixtures'

for (const width of [1440, 390]) {
 test(`sidebar resource status ${width}px distinguishes shared capacity and failed refresh`, async ({authenticatedPage: page}, testInfo) => {
  await page.setViewportSize({width, height: 844})
  let fail = false
  await page.route('**/api/v2/system/status', route => route.fulfill(fail ? {status: 503, json: {message: 'offline'}} : {json: {
   version: 'v2.7.1-tcymc.11', started: new Date().toISOString(), sampled: new Date().toISOString(), uptime_seconds: 90061, healthy: true,
   cpu_percent: 12.5, cpu_cores: 4, cpu_limited: true, memory_used: 1073741824, memory_total: 4294967296, memory_limited: false, disk_used: 10737418240, disk_total: 107374182400,
  }}))
  await page.goto('/ai')
  if (!await page.locator('.menu-container').evaluate(el => el.classList.contains('is-active'))) await page.locator('button.menu-show-button:visible').click()
  const status = page.getByRole('region', {name: 'Container health'})
  await status.scrollIntoViewIfNeeded()
  await expect(status).toContainText('12.5%')
  await expect(status).toContainText('25.0%')
  await expect(status).toContainText('10.0%')
  await expect(status).toContainText('1d 1h 1m')
  await expect(status.getByRole('link')).toHaveAttribute('href', /releases\/tag\/v2.7.1-tcymc.11$/)
  await status.getByText('How these numbers are measured').click()
  await expect(status).toContainText('shared host RAM')
  await expect(status).toContainText('not a private container disk quota')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path: testInfo.outputPath(`system-status-${width}.png`)})
  fail = true
  await page.reload()
  if (!await page.locator('.menu-container').evaluate(el => el.classList.contains('is-active'))) await page.locator('button.menu-show-button:visible').click()
  await status.scrollIntoViewIfNeeded()
  await expect(status).toContainText('Disconnected')
  fail = false
  await status.getByRole('button', {name: 'try again', exact: true}).click()
  await expect(status).toContainText('Healthy')
 })
}
