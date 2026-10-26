import {test, expect} from '../../support/fixtures'
import {UserFactory} from '../../factories/user'

test.use({currentUser: async ({apiContext}, use) => {
 UserFactory.setRequestContext(apiContext)
 const [user] = await UserFactory.create(1, {email: 'receiving@example.com'})
 await use(user)
}})


for (const width of [1440, 390]) {
 test(`mail settings admin editor and receiving email at ${width}px`, async ({authenticatedPage: page}, testInfo) => {
 await page.setViewportSize({width, height: 900})
 await page.route('**/api/v2/system/settings-access', route => route.fulfill({json: {can_manage_mail: true}}))
 let current = {enabled: true, host: 'relay.example.com', port: 2525, username: 'sender', from_email: 'no-reply@example.com', auth_type: 'plain', tls_mode: 'auto', skip_tls_verify: false, has_password: true, revision: 0, source: 'environment'}
 let reject = true
 await page.route('**/api/v2/system/mail-settings', async route => {
 if (route.request().method() === 'POST') {
 if (reject) return route.fulfill({status: 400, json: {detail: 'Enter the SMTP password again.', status: 400}})
 const submitted = route.request().postDataJSON()
 expect(submitted.password).toBe('new-private-fixture')
 const {password: _password, ...safe} = submitted
 current = {...safe, has_password: true, revision: 1, source: 'saved'}
 }
 return route.fulfill({json: current})
 })
 await page.goto('/user/settings/email-update')
 const email = page.getByTestId('current-email')
 await expect(email).toContainText('Current receiving email')
 await expect(email).toContainText('receiving@example.com')
 await page.goto('/user/settings/mail-server')
 await expect(page.getByLabel('SMTP host')).toHaveValue('relay.example.com')
 await expect(page.getByLabel('SMTP password', {exact: true})).toHaveAttribute('placeholder', 'Saved; leave blank to keep it')
 await page.getByLabel('SMTP host').fill('new-relay.example.com')
 await page.getByRole('button', {name: 'Save mail settings', exact: true}).click()
 await expect(page.locator('.mail-settings [role="alert"]')).toContainText('Your edits are still here')
 await expect(page.getByLabel('SMTP host')).toHaveValue('new-relay.example.com')
 reject = false
 await page.getByLabel('SMTP password', {exact: true}).fill('new-private-fixture')
 await page.getByRole('button', {name: 'Save mail settings', exact: true}).click()
 await expect(page.getByLabel('SMTP password', {exact: true})).toHaveValue('')
 await expect(page.locator('.mail-settings')).toContainText('Currently using settings saved on this page')
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
 await page.screenshot({path: testInfo.outputPath(`mail-settings-${width}.png`)})
 })
}
test('ordinary users have no SMTP entry or configuration request', async ({authenticatedPage: page}) => {
 let requested = false
 await page.route('**/api/v2/system/settings-access', route => route.fulfill({json: {can_manage_mail: false}}))
 await page.route('**/api/v2/system/mail-settings', route => { requested = true; return route.fulfill({status: 403, json: {detail: 'Forbidden'}}) })
 await page.goto('/user/settings/mail-server')
 await expect(page.getByRole('alert')).toContainText('You do not have permission')
 await expect(page.getByRole('link', {name: 'Website email (SMTP)', exact: true})).toHaveCount(0)
 expect(requested).toBe(false)
})
