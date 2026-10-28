import {test, expect} from '../../support/fixtures'
import {createProjects} from '../project/prepareProjects'
import {BucketFactory} from '../../factories/bucket'
import {TaskBucketFactory} from '../../factories/task_buckets'
import {TaskFactory} from '../../factories/task'
import {UserFactory} from '../../factories/user'
import {ProjectFactory} from '../../factories/project'
import {UserProjectFactory} from '../../factories/users_project'
import {apiRootUrl} from '../../support/apiUrl'

for (const width of [1440, 390]) {
	test(`progress can be removed and set again at ${width}px`, async ({authenticatedPage: page, apiContext}) => {
		await createProjects(1)
		await TaskFactory.create(1, {title: 'Progress lifecycle', percent_done: 0.5, description: '<p>Keep these notes</p>', priority: 3})
		await BucketFactory.create(1, {id: 1, project_view_id: 4})
		await TaskBucketFactory.create(1, {task_id: 1, bucket_id: 1, project_view_id: 4})
		await page.setViewportSize({width, height: 900})
		await page.goto('/projects/1/1')
		await expect(page.locator('.single-task progress')).toBeVisible()
		await page.getByText('Progress lifecycle', {exact: true}).click()
		const progress = page.locator('.progress-input select')
		const remove = page.getByRole('button', {name: 'Remove progress', exact: true})
		await expect(progress).toHaveValue('0.5')
		const token = await page.evaluate(() => localStorage.getItem('token'))
		const root = apiRootUrl(process.env.API_URL || 'http://127.0.0.1:3456') + '/api/v2'
		const read = async () => (await apiContext.get(`${root}/tasks/1`, {headers: {Authorization: `Bearer ${token}`}})).json()
		const before = await read()
		let failOnce = true
		await page.route('**/api/v2/tasks/1', async route => {
			if (route.request().method() !== 'PATCH') return route.continue()
			expect(route.request().postDataJSON()).toEqual([{op: 'add', path: '/percent_done', value: 0}])
			if (failOnce) {
				failOnce = false
				await route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({message: 'Progress test failure'})})
			} else await route.continue()
		})
		await remove.click()
		await expect(page.locator('.global-notification')).toContainText('Progress test failure')
		await expect(remove).toBeEnabled()
		await expect(progress).toHaveValue('0.5')
		expect((await read()).percent_done).toBe(0.5)
		await remove.click()
		await expect(progress).not.toBeVisible()
		const after = await read()
		expect(after.percent_done).toBe(0)
		for (const field of ['title', 'description', 'priority', 'done', 'due_date', 'start_date', 'end_date', 'project_id']) expect(after[field]).toEqual(before[field])
		await page.unroute('**/api/v2/tasks/1')
		await page.goto('/projects/1/1')
		await expect(page.getByText('Progress lifecycle', {exact: true})).toBeVisible()
		await expect(page.locator('.single-task progress')).toHaveCount(0)
		await page.goto('/projects/1/4')
		await expect(page.getByText('Progress lifecycle', {exact: true})).toBeVisible()
		await expect(page.locator('.kanban-view progress')).toHaveCount(0)
		await page.goto('/tasks/1')
		await page.reload()
		await expect(page.locator('.task-view')).toContainText('Progress lifecycle')
		await expect(progress).toHaveCount(0)
		await page.getByRole('button', {name: 'Set Progress', exact: true}).click()
		await progress.selectOption('0.7')
		await expect.poll(async () => (await read()).percent_done).toBe(0.7)
		await page.reload()
		await expect(progress).toHaveValue('0.7')
		await progress.selectOption('0')
		await expect(progress).toHaveCount(0)
		expect((await read()).percent_done).toBe(0)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	})
}

test('read-only task progress cannot be changed or removed', async ({authenticatedPage: page, currentUser}) => {
	await UserFactory.create(1, {id: 2}, false)
	await ProjectFactory.create(1, {id: 1, owner_id: 2})
	await UserProjectFactory.create(1, {project_id: 1, user_id: currentUser.id, permission: 0})
	await TaskFactory.create(1, {percent_done: 0.5, created_by_id: 2})
	await page.goto('/tasks/1')
	await expect(page.locator('.progress-input select')).toHaveValue('0.5')
	await expect(page.locator('.progress-input select')).toBeDisabled()
	await expect(page.getByRole('button', {name: 'Remove progress', exact: true})).toHaveCount(0)
})
