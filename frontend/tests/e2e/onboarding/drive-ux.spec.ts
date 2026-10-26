import {test, expect} from '../../support/fixtures'
import {Factory} from '../../support/factory'

test('removing the final file on page two returns to the remaining files', async ({authenticatedPage: page, currentUser}) => {
	await Factory.seed('files', Array.from({length: 61}, (_, i) => ({id: i + 1, name: `document-${i + 1}.txt`, mime: 'text/plain', size: 1, created_by_id: currentUser.id})))
	await Factory.seed('drive_files', Array.from({length: 61}, (_, i) => ({file_id: i + 1, owner_id: currentUser.id, revision: 1, pinned: false, category: ''})))
	await page.goto('/drive')
	await expect(page.getByRole('heading', {name: 'My Drive'})).toBeVisible({timeout: 15_000})
	await expect(page.locator('.drive-card')).toHaveCount(60)
	await page.getByRole('button', {name: 'Next', exact: true}).click()
	await expect(page.locator('.drive-card')).toHaveCount(1)
	await page.locator('.drive-card').getByRole('button', {name: 'Move to recycle bin', exact: true}).click()
	await page.getByRole('dialog', {name: 'Details and usages'}).getByRole('button', {name: 'Move to recycle bin', exact: true}).click()
	await expect(page.locator('.drive-card')).toHaveCount(60)
})

for (const filtered of ['search', 'trash']) {
	test(`upload reveals the new file from ${filtered}`, async ({authenticatedPage: page}) => {
		await page.goto('/drive')
		if (filtered === 'search') {
			await page.getByRole('searchbox').fill('no-such-file')
			await expect.poll(() => page.locator('.drive-summary').textContent()).toContain('0')
			await page.waitForTimeout(350) // Debounced search must reach the server before upload.
		} else {
			await page.getByRole('button', {name: 'Recycle bin', exact: true}).click()
		}
		await page.locator('.drive-browser input[type=file]').setInputFiles({name: 'visible-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('visible')})
		await expect(page.locator('.drive-card')).toContainText('visible-upload.txt')
		await expect(page.getByRole('searchbox')).toHaveValue('')
		await expect(page.getByRole('button', {name: 'Recycle bin', exact: true})).toBeVisible()
	})
}

test('cancelling the first image stops the whole upload queue', async ({authenticatedPage: page}) => {
	await page.goto('/drive')
	const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/RkAAAAASUVORK5CYII=', 'base64')
	await page.locator('.drive-browser input[type=file]').setInputFiles([
		{name: 'cancel.png', mimeType: 'image/png', buffer: image},
		{name: 'must-not-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('not uploaded')},
	])
	await page.getByRole('dialog', {name: 'Choose how to upload images'}).getByRole('button', {name: 'Cancel', exact: true}).click()
	await page.waitForTimeout(500) // Assert that a queued request does not follow cancellation.
	await expect(page.locator('.drive-card')).toHaveCount(0)
})

test('assistant does not claim to reconnect before a conversation is selected', async ({authenticatedPage: page}) => {
	await page.goto('/ai')
	await expect(page.locator('.live-connection')).not.toContainText('Connecting')
	await expect(page.locator('.live-connection')).not.toContainText('polling')
})

for (const width of [1440, 360]) {
	test(`Drive details have an opaque surface and a reachable close control at ${width}px`, async ({authenticatedPage: page}, testInfo) => {
		await page.setViewportSize({width, height: 720})
		await page.goto('/drive')
		await page.locator('.drive-browser input[type=file]').setInputFiles({name: 'details.txt', mimeType: 'text/plain', buffer: Buffer.from('details')})
		await page.locator('.drive-card').getByRole('button', {name: 'Details and usages', exact: true}).click()
		const panel = page.locator('.drive-details')
		await expect(panel).toBeVisible()
		await expect(page.getByRole('dialog', {name: 'Details and usages'})).toHaveCSS('opacity', '1')
		await page.screenshot({path: testInfo.outputPath('drive-details.png')})
		expect(await panel.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
		expect(await panel.evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(width)
		if (width < 600) {
			const box = (await panel.boundingBox())!
			expect(box.x).toBeGreaterThanOrEqual(12)
			expect(Math.abs(box.x - (width - box.x - box.width))).toBeLessThanOrEqual(2)
		}
		await page.evaluate(() => {document.documentElement.classList.replace('light', 'dark')})
		const field = panel.getByLabel('File name')
		await expect.poll(() => field.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await panel.evaluate(el => getComputedStyle(el).backgroundColor))
		await page.screenshot({path: testInfo.outputPath('drive-details-dark.png')})
		await panel.getByRole('button', {name: 'Close dialog'}).click()
		await expect(page.getByRole('dialog', {name: 'Details and usages'})).not.toBeVisible()
		await page.getByRole('searchbox').fill('nothing-matches')
		await expect(page.getByText('No files match these filters.')).toBeVisible()
		await page.getByRole('button', {name: 'Clear filters'}).click()
		await expect(page.locator('.drive-card')).toHaveCount(1)
	})
}

test('cancelling an attachment image also cancels the remaining files', async ({authenticatedPage: page}) => {
	const {createProjects} = await import('../project/prepareProjects')
	const {TaskFactory} = await import('../../factories/task')
	await createProjects(1)
	await TaskFactory.create(1, {title: 'Cancel attachment batch'})
	await page.goto('/tasks/1')
	const chooser = page.waitForEvent('filechooser')
	await page.getByRole('button', {name: 'Add Attachments', exact: true}).click()
	await (await chooser).setFiles([
		{name: 'cancel.png', mimeType: 'image/png', buffer: Buffer.from('image choice happens before decoding')},
		{name: 'must-not-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('private queued attachment')},
	])
	await page.getByRole('dialog', {name: 'Choose how to upload images'}).getByRole('button', {name: 'Cancel', exact: true}).click()
	await expect(page.getByRole('dialog', {name: 'Choose how to upload images'})).not.toBeVisible()
	await page.waitForTimeout(500)
	await expect(page.locator('.attachments .files .attachment')).toHaveCount(0)
	await page.goto('/drive')
	await expect(page.locator('.drive-card')).toHaveCount(0)
})
