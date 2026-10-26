import {test, expect} from '../../support/fixtures'
import {apiRootUrl} from '../../support/apiUrl'

// Encrypted model settings live in the test files directory, beyond the fixture database reset.
test.afterEach(async ({apiContext, userToken}) => {
	const api = `${apiRootUrl(process.env.API_URL || 'http://localhost:3456')}/api/v2`
	const response = await apiContext.post(`${api}/ai/settings`, {headers: {Authorization: `Bearer ${userToken}`}, data: {connections: [], assistant: '', transcription: '', cleanup: ''}})
	expect(response.ok()).toBeTruthy()
})

for (const width of [1440, 390]) {
	test(`model capacity imports, overrides and persists at ${width}px`, async ({authenticatedPage: page}, testInfo) => {
		await page.setViewportSize({width, height: 900})
		await page.route('**/api/v2/ai/models', route => route.fulfill({json: {endpoint: 'https://api.deepseek.com/models', models: ['deepseek-flash'], details: [{id: 'deepseek-flash', context_window: 1048576, max_output_tokens: 393216, input_types: ['text', 'image']}], truncated: false}}))
		await page.goto('/user/settings/ai')
		await page.getByRole('button', {name: 'Add model connection'}).click()
		await page.getByLabel('Connection name').fill('Vision and capacity fixture')
		await page.getByLabel('API base URL').fill('https://api.deepseek.com/anthropic')
		await page.getByLabel('Request protocol').selectOption('anthropic')
		await page.getByLabel('Model ID', {exact: true}).fill('deepseek-flash')
		await expect(page.locator('.endpoint-info')).toContainText('https://api.deepseek.com/models')
		await expect(page.locator('.endpoint-info')).not.toContainText('/anthropic/models')
		await page.getByRole('button', {name: 'Fetch model list'}).click()
		await page.locator('.model-options > summary').click()
		await page.getByRole('button', {name: 'Use capabilities from the model directory'}).click()
		await expect(page.getByLabel('Context window (tokens)', {exact: true})).toHaveValue('1048576')
		await expect(page.getByLabel('Maximum output (tokens)', {exact: true})).toHaveValue('393216')
		await expect(page.getByLabel('Model input capabilities', {exact: true})).toHaveValue('text,image')
		await page.getByLabel('Maximum output (tokens)', {exact: true}).fill('262144')
		await page.getByRole('button', {name: 'Fetch model list'}).click()
		await expect(page.getByLabel('Maximum output (tokens)', {exact: true})).toHaveValue('262144')
		await page.getByLabel('API key', {exact: true}).fill('test-only-private-capability-key')
		const saved = page.waitForResponse(r => r.url().endsWith('/ai/settings') && r.request().method() === 'POST')
		await page.getByRole('button', {name: 'Save settings', exact: true}).click()
		const response = await saved
		expect(response.ok()).toBeTruthy()
		const body = await response.json()
		expect(body.connections[0].resolved.max_output_tokens).toBe(262144)
		expect(JSON.stringify(body)).not.toContain('test-only-private-capability-key')
		await page.reload()
		await page.locator('.model-options > summary').click()
		await expect(page.getByLabel('Maximum output (tokens)', {exact: true})).toHaveValue('262144')
		await expect(page.getByLabel('Model input capabilities', {exact: true})).toHaveValue('text,image')
		await expect(page.locator('.model-resolved')).toContainText('262,144')
		await expect(page.locator('.audio-test')).toHaveCount(0)
		await expect(page.getByLabel('API key', {exact: true})).toHaveValue('')
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
		await page.screenshot({path: testInfo.outputPath(`model-options-${width}.png`), animations: 'disabled'})
	})
}
