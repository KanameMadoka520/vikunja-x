import {setupApiUrl} from '../../support/authenticateUser'
import {test, expect} from '../../support/fixtures'
import {apiV1Url} from '../../support/apiUrl'

test.describe('OpenID Login', () => {
	test('logs in via Dex provider', async ({page, request}) => {
		// The Dex container and provider config come from outside `mage test:e2e` (tests/e2e/README.md).
		const info = await (await request.get(`${apiV1Url()}/info`)).json()
		const providers: {name?: string}[] = info.auth?.openid_connect?.providers ?? []
		test.skip(!providers.some(provider => provider.name === 'Dex'), 'needs the Dex OpenID provider from tests/e2e/README.md')
		await setupApiUrl(page)
		await page.goto('/login')
		await page.locator('text=Dex').click()

		// Wait for navigation to Dex origin
		await expect(page.locator('h2')).toContainText('Log in to Your Account')

		// Fill in the Dex login form
		await page.locator('#login').fill('test@example.com')
		await page.locator('#password').fill('12345678')
		await page.locator('#submit-login').click()

		// Should redirect back to the app
		await expect(page).toHaveURL(/\//)
		await expect(page.locator('main.app-content .content h1')).toContainText('test')
		await expect(page.locator('.show-tasks h2')).toContainText('Current Tasks')
	})
})
