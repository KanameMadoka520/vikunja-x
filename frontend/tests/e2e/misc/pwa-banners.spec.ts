import {test, expect} from '../../support/fixtures'
import {UserFactory} from '../../factories/user'
import {setupApiUrl} from '../../support/authenticateUser'
import {TEST_PASSWORD} from '../../support/constants'

// The add to home screen banner is hidden from tablet width up
const iPhone8 = {
	width: 375,
	height: 667,
}

test.describe('PWA banners', () => {
	test.use({viewport: iPhone8})

	test.beforeEach(async ({page}) => {
		await setupApiUrl(page)
		await page.goto('/login')
		await expect(page.locator('input[id=username]')).toBeVisible()
		// Service workers are blocked in e2e, so fake the event registerServiceWorker.ts dispatches. The banner
		// only trusts a waiting worker that reports a newer build (same-version cases live in tcy-updates.spec.ts).
		await page.evaluate(() => {
			const registration = {waiting: {postMessage(message: string, ports?: MessagePort[]) {
				if (message === 'getVersion') ports?.[0].postMessage({version: 'v99.0.0-tcymc.1'})
			}}}
			Object.defineProperty(navigator.serviceWorker, 'getRegistration', {value: async () => registration, configurable: true})
			document.dispatchEvent(new CustomEvent('swUpdated', {detail: registration}))
		})
	})

	test('Are hidden on the login page', async ({page}) => {
		await expect(page.locator('.update-notification')).toBeHidden()
		await expect(page.locator('.add-to-home-screen')).toBeHidden()
	})

	test('Show after logging in, including an update found on the login page', async ({page}) => {
		const [user] = await UserFactory.create(1)
		await page.locator('input[id=username]').fill(user.username)
		await page.locator('input[id=password]').fill(TEST_PASSWORD)
		await page.locator('.button').filter({hasText: 'Login'}).click()
		await expect(page).toHaveURL('/')

		await expect(page.locator('.update-notification')).toContainText('v99.0.0-tcymc.1')
		await expect(page.locator('.add-to-home-screen')).toBeVisible()
	})
})
