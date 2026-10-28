import {test, expect} from '../../support/fixtures'
import {createProjects} from '../project/prepareProjects'
import {BucketFactory} from '../../factories/bucket'
import {TaskBucketFactory} from '../../factories/task_buckets'
import {TaskFactory} from '../../factories/task'
import {apiRootUrl} from '../../support/apiUrl'

for (const width of [1440, 390]) {
	test(`attachment byte progress and speed remain visible inside the task dialog at ${width}px`, async ({authenticatedPage: page, apiContext}, testInfo) => {
		test.setTimeout(60_000)
		await createProjects(1)
		await TaskFactory.create(1, {title: 'Upload progress test'})
		await BucketFactory.create(1, {id: 1, project_view_id: 4})
		await TaskBucketFactory.create(1, {task_id: 1, bucket_id: 1, project_view_id: 4})
		await page.setViewportSize({width, height: 900})
		await page.goto('/projects/1/4')
		await page.getByText('Upload progress test', {exact: true}).click()
		await expect(page.locator('dialog[open] .task-view')).toBeVisible()
		const cdp = await page.context().newCDPSession(page)
		await cdp.send('Network.enable')
		await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 20, downloadThroughput: 10 * 1024 * 1024, uploadThroughput: 32 * 1024})
		const chooser = page.waitForEvent('filechooser')
		await page.getByRole('button', {name: 'Add Attachments', exact: true}).click()
		await (await chooser).setFiles({name: 'upload-progress.txt', mimeType: 'text/plain', buffer: Buffer.alloc(256 * 1024, 'a')})
		const row = page.locator('.attachment-upload-status .upload-row').first()
		await expect(row).toBeVisible()
		await expect.poll(async () => parseInt(await row.locator('.upload-percent').innerText()) > 0 && parseInt(await row.locator('.upload-percent').innerText()) < 100).toBe(true)
		await expect.poll(async () => parseFloat(await row.locator('.upload-speed').innerText())).toBeGreaterThan(0)
		await row.scrollIntoViewIfNeeded()
		expect(await row.locator('.upload-speed').evaluate(element => {
			const rect = element.getBoundingClientRect()
			return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
		})).toBe(true)
		await page.screenshot({path: testInfo.outputPath('upload-in-progress.png')})
		await expect(row).toHaveAttribute('data-stage', 'done', {timeout: 30_000})
		await expect(row.locator('.upload-percent')).toHaveText('100%')
		await expect(row.locator('.upload-speed')).toContainText('Average')
		await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1})
		const token = await page.evaluate(() => localStorage.getItem('token'))
		const root = apiRootUrl(process.env.API_URL || 'http://127.0.0.1:3456') + '/api/v2'
		const saved = await (await apiContext.get(`${root}/tasks/1`, {headers: {Authorization: `Bearer ${token}`}})).json()
		expect(saved.attachments).toHaveLength(1)
		expect(saved.attachments[0].file.size).toBe(256 * 1024)
		await page.reload()
		await expect(page.locator('.attachment-info-column')).toContainText('upload-progress.txt')
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
		await cdp.detach()
	})
}

test('upload shows a failure and a successful retry', async ({authenticatedPage: page}) => {
	await createProjects(1)
	await TaskFactory.create(1, {title: 'Upload lifecycle'})
	await page.goto('/tasks/1')
	let fail = true
	await page.route('**/api/v2/tasks/1/attachments', async route => {
		if (route.request().method() !== 'POST') return route.continue()
		if (fail) {
			fail = false
			await route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({message: 'Temporary upload failure'})})
		} else await route.continue()
	})
	async function upload() {
		const chooser = page.waitForEvent('filechooser')
		await page.getByRole('button', {name: 'Add Attachments', exact: true}).click()
		await (await chooser).setFiles({name: 'retry-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('Upload retry fixture')})
	}
	await upload()
	const row = page.locator('.attachment-upload-status .upload-row').first()
	await expect(row).toHaveAttribute('data-stage', 'error')
	await expect(row).toContainText('HTTP 500')
	await upload()
	await expect(row).toHaveAttribute('data-stage', 'done')
	await expect(page.locator('.attachment-info-column')).toContainText('retry-upload.txt')
	await page.reload()
	await expect(page.locator('.attachment-info-column')).toContainText('retry-upload.txt')
})
