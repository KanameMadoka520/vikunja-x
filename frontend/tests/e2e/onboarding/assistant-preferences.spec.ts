import {test, expect} from '../../support/fixtures'
import {apiRootUrl} from '../../support/apiUrl'

const api = `${apiRootUrl(process.env.API_URL || 'http://localhost:3456')}/api/v2`
test.beforeEach(async ({apiContext, userToken}) => {
	const headers = {Authorization: `Bearer ${userToken}`}
	const old = await (await apiContext.get(`${api}/ai/preferences`, {headers})).json()
	expect((await apiContext.post(`${api}/ai/preferences`, {headers, data: {revision: old.revision ?? 0, default_profile: 'ask', profiles: []}})).ok()).toBeTruthy()
})

for (const width of [1440, 390]) {
	test(`scenario templates ${width}px explain permissions, persist defaults and keep composer reachable`, async ({authenticatedPage: page}, testInfo) => {
		await page.setViewportSize({width, height: 900})
		await page.goto('/ai')
		await expect(page.locator('.profile-switch select')).toHaveValue('ask')
		await expect(page.getByLabel('Working mode')).toHaveCount(0)
		await expect(page.getByLabel('Segment token soft limit')).toHaveCount(0)
		await page.getByRole('button', {name: 'Scenarios & preferences', exact: true}).waitFor()
		await expect(page.locator('.vikunja-loading')).not.toBeVisible()
		await page.screenshot({path: testInfo.outputPath(`assistant-welcome-${width}.png`)})
		const open = page.getByRole('button', {name: 'Scenarios & preferences', exact: true})
		await open.click()
		const panel = page.getByRole('dialog', {name: 'Scenarios & preferences'})
		await expect(panel).toBeVisible()
		await expect(panel.getByLabel('Allow task deletion for this request')).toBeDisabled()
		await panel.getByRole('button', {name: /Plan & review Turn ideas/}).click()
		await expect(panel.getByLabel('Working mode')).toHaveValue('write')
		await expect(panel.getByLabel('Operation review policy')).toHaveValue('review')
		await panel.getByText('Advanced execution budget', {exact: true}).click()
		await expect(panel).toContainText('Each model request after reading tool results')
		await panel.getByLabel('Model requests (1–40)').fill('18')
		await panel.getByLabel('Save a personal template', {exact: true}).fill('Weekly review')
		await panel.getByRole('button', {name: 'Save as new template'}).click()
		await expect(panel.getByLabel('My templates')).toContainText('Weekly review')
		await panel.getByRole('button', {name: 'Make my default'}).click()
		await expect(panel.getByLabel('My templates')).toContainText('Weekly review · Default')
		await page.screenshot({path: testInfo.outputPath(`assistant-preferences-${width}.png`)})
		await panel.getByRole('button', {name: 'Use for upcoming messages'}).click()
		await expect(panel).not.toBeVisible()
		await expect(open).toBeFocused()
		await expect(page.locator('.profile-switch select')).toContainText('Weekly review')
		await page.reload()
		await expect(page.locator('.profile-switch select')).toHaveValue(/^custom-/)
		await open.click()
		await expect(panel.getByLabel('Working mode')).toHaveValue('write')
		await panel.getByText('Advanced execution budget', {exact: true}).click()
		await expect(panel.getByLabel('Model requests (1–40)')).toHaveValue('18')
		await panel.getByLabel('Model requests (1–40)').fill('19')
		await panel.getByRole('button', {name: 'Update this template'}).click()
		await expect(panel.getByRole('status')).toContainText('Saved to your account')
		// Cancel is a real cancel: editing the dialog never mutates live options.
		await panel.getByLabel('Working mode').selectOption('read')
		await page.keyboard.press('Escape')
		await expect(panel).not.toBeVisible()
		await open.click()
		await expect(panel.getByLabel('Working mode')).toHaveValue('write')
		await panel.getByRole('button', {name: 'Delete this template'}).click()
		await expect(panel.getByLabel('My templates')).toHaveCount(0)
		await panel.getByRole('button', {name: 'Use for upcoming messages'}).click()
		await expect(page.locator('.profile-switch select')).toHaveValue('ask')
		// A smaller visual viewport approximates a mobile keyboard without moving input off screen.
		await page.setViewportSize({width, height: 500})
		await page.getByLabel('Your request').fill('Long draft\n'.repeat(20))
		const box = await page.locator('.composer').boundingBox()
		expect(box!.y + box!.height).toBeLessThanOrEqual(500)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
		await page.screenshot({path: testInfo.outputPath(`assistant-keyboard-${width}.png`)})
	})
}

test('a stale template save retains edits and asks to reload instead of overwriting another window', async ({authenticatedPage: page, apiContext, userToken}) => {
	await page.goto('/ai')
	await page.getByRole('button', {name: 'Scenarios & preferences', exact: true}).click()
	const panel = page.getByRole('dialog', {name: 'Scenarios & preferences'})
	await panel.getByLabel('Save a personal template', {exact: true}).fill('Do not lose this')
	const headers = {Authorization: `Bearer ${userToken}`}
	const old = await (await apiContext.get(`${api}/ai/preferences`, {headers})).json()
	expect((await apiContext.post(`${api}/ai/preferences`, {headers, data: {...old, profiles: [], default_profile: 'plan'}})).ok()).toBeTruthy()
	await panel.getByRole('button', {name: 'Save as new template'}).click()
	await expect(panel.getByRole('alert')).toContainText('Another window')
	await expect(panel.getByLabel('Save a personal template', {exact: true})).toHaveValue('Do not lose this')
	await panel.getByRole('button', {name: 'Try again', exact: true}).click()
	await panel.getByRole('button', {name: 'Save as new template'}).click()
	await expect(panel.getByLabel('My templates')).toContainText('Do not lose this')
})

for (const width of [1440, 390]) {
	test(`dark assistant ${width}px keeps preference fields and conversation readable`, async ({authenticatedPage: page}, testInfo) => {
		await page.setViewportSize({width, height: 900})
		await page.goto('/ai')
		await expect(page.locator('.vikunja-loading')).not.toBeVisible()
		await page.evaluate(() => document.documentElement.classList.replace('light', 'dark'))
		await page.getByRole('button', {name: 'Scenarios & preferences', exact: true}).click()
		const panel = page.getByRole('dialog', {name: 'Scenarios & preferences'})
		await expect.poll(() => panel.evaluate(el => {
			const color = getComputedStyle(el).backgroundColor.match(/\d+/g)!.map(Number)
			return color[0] + color[1] + color[2]
		})).toBeLessThan(300)
		const colors = await panel.getByLabel('Working mode').evaluate(el => ({text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor}))
		expect(colors.text).not.toBe(colors.background)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
		await page.screenshot({path: testInfo.outputPath(`assistant-dark-${width}.png`)})
		await page.keyboard.press('Escape')
		await expect(panel).not.toBeVisible()
		await page.getByLabel('Your request').fill('A draft in dark mode')
		await page.screenshot({path: testInfo.outputPath(`assistant-dark-composer-${width}.png`)})
	})
}
