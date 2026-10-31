import {test, expect} from '../../../support/fixtures'
for (const width of [1440, 390, 320]) {
 test(`Bark settings save separately and protect keys at ${width}px`, async ({authenticatedPage: page}) => {
  await page.setViewportSize({width, height: 950})
  await page.goto('/user/settings/push')
  await expect(page.getByRole('heading', {name: 'Mobile push · Bark'})).toBeVisible()
  await page.getByLabel('Device key', {exact: true}).fill('test-only-device-key')
  await page.getByRole('button', {name: 'Save push settings', exact: true}).click()
  await expect(page.getByLabel('Device key', {exact: true})).toHaveValue('')
  await expect(page.getByRole('button', {name: 'Send test push', exact: true})).toBeEnabled()
  await page.reload()
  await expect(page.getByLabel('Device key', {exact: true})).toHaveValue('')
  await page.getByLabel('Bark server URL', {exact: true}).fill('https://new.example')
  await expect(page.getByRole('button', {name: 'Send test push', exact: true})).toBeDisabled()
  await expect(page.getByText('Save your changes before testing.', {exact: true})).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
 })
}
