import {test, expect} from '../../support/fixtures'
import {ProjectFactory} from '../../factories/project'
import {ProjectViewFactory} from '../../factories/project_view'
import {TaskFactory} from '../../factories/task'
import {updateUserSettings} from '../../support/updateUserSettings'

test('announcements and routine history fit light, dark and narrow layouts', async ({authenticatedPage: page, apiContext, userToken}, testInfo) => {
	test.setTimeout(90_000)
	await ProjectFactory.create(1, {id: 1, title: 'Personal studio'})
	await ProjectViewFactory.create(1, {id: 1, project_id: 1, title: 'List', view_kind: 0})
	await TaskFactory.create(1, {id: 1, project_id: 1, title: 'Review the day and prepare tomorrow'})
	const headers = {Authorization: `Bearer ${userToken}`}
	for (const [path, data] of [
		['/projects/1/announcement', {title: 'Studio notes', content: '<p>Keep room for focused work. Check the daily routine before wrapping up.</p><ul><li>Review progress</li><li>Write down the next step</li></ul>', revision: 0}],
		['/tasks/1/routine', {enabled: true, paused: false, timezone: 'Asia/Shanghai', revision: 0}],
	] as const) {
		const response = await apiContext.put(`/api/v2${path}`, {headers, data})
		expect(response.ok()).toBe(true)
	}
	const summary = await apiContext.get('/api/v2/tasks/1/routine', {headers})
	const {date} = await summary.json()
	const checked = await apiContext.post('/api/v2/tasks/1/routine/check-in', {headers, data: {date, completed: true}})
	expect(checked.ok()).toBe(true)
	await page.emulateMedia({reducedMotion: 'reduce'})
	for (const theme of ['light', 'dark'] as const) {
		await updateUserSettings(apiContext, userToken, {frontend_settings: {color_schema: theme}})
		await page.emulateMedia({colorScheme: theme})
		for (const width of [1280, 390, 320]) {
			await page.setViewportSize({width, height: 900})
			await page.goto('/projects/1/1')
			await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
			await expect(page.locator('.project-announcement')).toContainText('Studio notes')
			await expect(page.locator('[data-routine-status="done"]')).toBeVisible()
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
			await page.screenshot({path: testInfo.outputPath(`project-${theme}-${width}.png`), fullPage: true})
			await page.goto('/tasks/1')
			const panel = page.locator('.task-routine')
			await panel.getByRole('button', {name: 'View routine history'}).click()
			await expect(panel.locator('.routine-calendar')).toBeVisible()
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
			await panel.scrollIntoViewIfNeeded()
			await page.screenshot({path: testInfo.outputPath(`routine-${theme}-${width}.png`), fullPage: true})
		}
	}
})
