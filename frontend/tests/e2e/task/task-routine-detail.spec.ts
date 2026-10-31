import type {APIRequestContext, Page} from '@playwright/test'

import {test, expect} from '../../support/fixtures'
import {ProjectFactory} from '../../factories/project'
import {TaskFactory} from '../../factories/task'
import {UserFactory} from '../../factories/user'
import {UserProjectFactory} from '../../factories/users_project'
import {apiRootUrl} from '../../support/apiUrl'
import {login} from '../../support/authenticateUser'
import {updateUserSettings} from '../../support/updateUserSettings'

const API = `${apiRootUrl(process.env.API_URL || 'http://127.0.0.1:3456')}/api/v2`
// Deliberately not the browser's zone: the detail must use the routine's zone, never the viewer's.
const ZONE = 'Asia/Shanghai'

type RoutineSummary = {
	enabled: boolean
	paused: boolean
	timezone: string
	revision: number
	date: string
	completed_today: boolean
	completed_at: string
	completed_by_id: number
}

type TaskBody = {
	id: number
	done: boolean
	repeat_after: number
	repeat_mode: number
	due_date: string
	routine?: RoutineSummary | null
}

type HistoryBody = {
	items: {
		date: string
		timezone: string
		completed_at: string
		completed_by_id: number
	}[]
	current_streak: number
}

type RoutineWrite = {
	method: string
	path: string
	body: Record<string, unknown> | null
}

function routineApi(apiContext: APIRequestContext, token: string) {
	const headers = {Authorization: `Bearer ${token}`}
	const read = async <T>(path: string): Promise<T> => {
		const response = await apiContext.get(`${API}${path}`, {headers})
		expect(response.ok()).toBe(true)
		return response.json()
	}
	const api = {
		task: (id: number) => read<TaskBody>(`/tasks/${id}`),
		routine: (id: number) => read<RoutineSummary>(`/tasks/${id}/routine`),
		history: (id: number, date: string) => read<HistoryBody>(
			`/tasks/${id}/routine/history?year=${Number(date.slice(0, 4))}&month=${Number(date.slice(5, 7))}`,
		),
		async configure(id: number, body: {enabled: boolean, paused: boolean, timezone: string}) {
			const {revision} = await api.routine(id)
			const response = await apiContext.put(`${API}/tasks/${id}/routine`, {
				headers,
				data: {...body, revision},
			})
			expect(response.ok()).toBe(true)
		},
		async checkIn(id: number, completed = true) {
			const {date} = await api.routine(id)
			const response = await apiContext.post(`${API}/tasks/${id}/routine/check-in`, {
				headers,
				data: {date, completed},
			})
			expect(response.ok()).toBe(true)
		},
	}
	return api
}

// Chromium reports no body for requests that are not intercepted, so writes are read in a pass-through route.
async function recordRoutineWrites(page: Page, taskId: number) {
	const writes: RoutineWrite[] = []
	await page.route(url => url.pathname.includes(`/api/v2/tasks/${taskId}/routine`), route => {
		const request = route.request()
		if (request.method() !== 'GET') {
			writes.push({
				method: request.method(),
				path: new URL(request.url()).pathname,
				body: request.postDataJSON(),
			})
		}
		return route.fallback()
	})
	return writes
}

const isConfigure = (write: RoutineWrite) => write.method === 'PUT' && write.path.endsWith('/routine')
const isCheckIn = (write: RoutineWrite) => write.method === 'POST' && write.path.endsWith('/routine/check-in')

function routineResponse(page: Page, taskId: number, kind: 'configure' | 'check-in') {
	return page.waitForResponse(response => {
		const path = new URL(response.url()).pathname
		return kind === 'configure'
			? response.request().method() === 'PUT' && path.endsWith(`/api/v2/tasks/${taskId}/routine`)
			: response.request().method() === 'POST' && path.endsWith(`/api/v2/tasks/${taskId}/routine/check-in`)
	})
}

function taskPatched(page: Page, taskId: number) {
	return page.waitForResponse(response => response.request().method() === 'PATCH'
		&& new URL(response.url()).pathname.endsWith(`/api/v2/tasks/${taskId}`))
}

// The Done shortcut must reach the page, not a focused form field.
async function blur(page: Page) {
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

function detail(page: Page) {
	const view = page.locator('.task-view')
	return {
		chip: view.locator('.task-header .routine-status'),
		checkIn: view.locator('.task-primary-actions .button--routine-check-in'),
		done: view.locator('.task-primary-actions .button--mark-done'),
		pausedNote: view.locator('.task-primary-actions__note'),
		panel: view.locator('.task-routine'),
		routineAction: view.locator('.action-buttons .task-routine-action'),
		repeatAction: view.locator('.action-buttons').getByRole('button', {name: 'Set Repeating Interval'}),
	}
}

async function useAccountZone(apiContext: APIRequestContext, token: string) {
	await updateUserSettings(apiContext, token, {
		timezone: ZONE,
		frontend_settings: {time_format: '24h'},
	})
}

test.describe('Daily routine in the task detail', () => {
	test.use({timezoneId: 'America/Los_Angeles'})

	test.beforeEach(async () => {
		await ProjectFactory.create(1, {id: 1})
	})

	test('turns on with the account zone, checks in once per click and never marks the task done', async ({
		authenticatedPage: page,
		apiContext,
		userToken,
	}) => {
		await useAccountZone(apiContext, userToken)
		await TaskFactory.create(1, {id: 1, project_id: 1, title: 'Water the plants'})
		const api = routineApi(apiContext, userToken)
		const ui = detail(page)
		const writes = await recordRoutineWrites(page, 1)

		await page.goto('/tasks/1')
		await expect(ui.done).toContainText('Mark task done!')
		await expect(ui.panel).toHaveCount(0)

		await expect(ui.routineAction).toHaveText('Make daily routine')
		await ui.routineAction.click()
		await expect(ui.panel).toBeVisible()
		await expect(ui.panel.getByRole('combobox', {name: 'Time zone'})).toHaveValue(ZONE)
		await expect(ui.panel).toContainText('one check-in a day is enough')

		const enabled = routineResponse(page, 1, 'configure')
		await ui.panel.getByRole('button', {name: 'Turn on daily routine'}).click()
		expect((await enabled).ok()).toBe(true)
		expect(writes.filter(isConfigure).map(write => write.body)).toEqual([{
			enabled: true,
			paused: false,
			timezone: ZONE,
			revision: 0,
		}])
		const configured = await api.routine(1)
		expect(configured.enabled).toBe(true)
		expect(configured.timezone).toBe(ZONE)

		// Check-in replaces Done, and the ordinary repeat editor is off while the routine is on.
		await expect(ui.checkIn).toHaveText('Check in today')
		await expect(ui.done).toHaveCount(0)
		await expect(ui.chip).toHaveAttribute('data-routine-status', 'pending')
		await expect(ui.repeatAction).toHaveAttribute('aria-disabled', 'true')
		await expect(page.locator('.action-note')).toBeVisible()

		const checkedIn = routineResponse(page, 1, 'check-in')
		await ui.checkIn.dblclick()
		expect((await checkedIn).ok()).toBe(true)
		await expect(ui.chip).toHaveAttribute('data-routine-status', 'done')
		await expect(ui.checkIn).toHaveText('Undo today\'s check-in')
		expect(writes.filter(isCheckIn).map(write => write.body)).toEqual([{date: configured.date, completed: true}])
		const afterCheckIn = await api.task(1)
		expect(afterCheckIn.done).toBe(false)
		expect(afterCheckIn.routine?.completed_today).toBe(true)
		await expect(ui.panel.locator('.task-routine__status')).toContainText('by you')

		const undone = routineResponse(page, 1, 'check-in')
		await ui.checkIn.click()
		expect((await undone).ok()).toBe(true)
		await expect(ui.chip).toHaveAttribute('data-routine-status', 'pending')
		await expect(ui.checkIn).toHaveText('Check in today')
		const afterUndo = await api.task(1)
		expect(afterUndo.done).toBe(false)
		expect(afterUndo.routine?.completed_today).toBe(false)

		// The Done shortcut checks the routine in instead of marking the task done.
		await blur(page)
		const byShortcut = routineResponse(page, 1, 'check-in')
		await page.keyboard.press('t')
		expect((await byShortcut).ok()).toBe(true)
		await expect(ui.chip).toHaveAttribute('data-routine-status', 'done')
		expect(writes.filter(isCheckIn)).toHaveLength(3)
		expect((await api.task(1)).done).toBe(false)

		await page.reload()
		await expect(ui.chip).toHaveAttribute('data-routine-status', 'done')
		await expect(ui.checkIn).toHaveText('Undo today\'s check-in')
	})

	test('the history month shows each check-in with its time, zone and member', async ({
		authenticatedPage: page,
		apiContext,
		userToken,
	}) => {
		await useAccountZone(apiContext, userToken)
		await TaskFactory.create(1, {id: 1, project_id: 1, title: 'Stand-up notes'})
		const api = routineApi(apiContext, userToken)
		await api.configure(1, {enabled: true, paused: false, timezone: ZONE})
		await api.checkIn(1)
		const {date} = await api.routine(1)
		const [record] = (await api.history(1, date)).items
		expect(record.date).toBe(date)
		const time = new Intl.DateTimeFormat('en', {
			timeZone: ZONE,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		}).format(new Date(record.completed_at))
		const ui = detail(page)

		await page.goto('/tasks/1')
		await ui.panel.getByRole('button', {name: 'View routine history'}).click()
		const history = ui.panel.locator('.routine-history')
		const day = history.locator(`.routine-day[data-date="${date}"]`)
		await expect(day).toHaveAttribute('data-checked', 'true')
		await expect(day).toHaveAttribute('data-today', 'true')
		await expect(day).toContainText('today, checked in')
		const row = history.locator(`.routine-record[data-date="${date}"]`)
		await expect(row).toContainText(`${time} (${ZONE})`)
		await expect(row).toContainText('by you')
		await expect(history.locator('.routine-record')).toHaveCount(1)
		await expect(history.locator('.routine-stat').first()).toContainText('1 day')

		// Nothing after the routine's current month can be browsed.
		await expect(history.getByRole('button', {name: 'Next month'})).toHaveAttribute('aria-disabled', 'true')
	})

	test('a repeating task only becomes a routine after its repeat is removed explicitly', async ({
		authenticatedPage: page,
		apiContext,
		userToken,
	}) => {
		await useAccountZone(apiContext, userToken)
		await TaskFactory.create(1, {
			id: 1,
			project_id: 1,
			repeat_after: 86400,
			due_date: new Date(Date.now() + 86_400_000).toISOString(),
		})
		const api = routineApi(apiContext, userToken)
		const ui = detail(page)
		const writes = await recordRoutineWrites(page, 1)

		await page.goto('/tasks/1')
		await ui.routineAction.click()
		const blocker = ui.panel.locator('[data-routine-blocker="repeat"]')
		await expect(blocker).toBeVisible()
		const enable = ui.panel.getByRole('button', {name: 'Turn on daily routine'})
		await expect(enable).toHaveAttribute('aria-disabled', 'true')
		await enable.dispatchEvent('click')

		// Nothing changed behind the user's back.
		expect(writes).toHaveLength(0)
		const untouched = await api.task(1)
		expect(untouched.repeat_after).toBe(86400)
		expect(untouched.routine ?? null).toBeNull()

		const removed = taskPatched(page, 1)
		await blocker.getByRole('button', {name: 'Remove ordinary repeat'}).click()
		expect((await removed).ok()).toBe(true)
		await expect(blocker).toHaveCount(0)
		await expect(enable).not.toHaveAttribute('aria-disabled', 'true')
		expect(writes).toHaveLength(0)

		const enabled = routineResponse(page, 1, 'configure')
		await enable.click()
		expect((await enabled).ok()).toBe(true)
		await expect(ui.checkIn).toBeVisible()
		const after = await api.task(1)
		expect(after.repeat_after).toBe(0)
		expect(after.routine?.enabled).toBe(true)
	})

	test('a done task has to be reopened before it can become a routine', async ({
		authenticatedPage: page,
		apiContext,
		userToken,
	}) => {
		await useAccountZone(apiContext, userToken)
		await TaskFactory.create(1, {
			id: 1,
			project_id: 1,
			done: true,
			done_at: new Date().toISOString(),
		})
		const api = routineApi(apiContext, userToken)
		const ui = detail(page)
		const writes = await recordRoutineWrites(page, 1)

		await page.goto('/tasks/1')
		await ui.routineAction.click()
		const blocker = ui.panel.locator('[data-routine-blocker="done"]')
		await expect(blocker).toBeVisible()
		await expect(ui.panel.locator('[data-routine-blocker="repeat"]')).toHaveCount(0)
		const enable = ui.panel.getByRole('button', {name: 'Turn on daily routine'})
		await expect(enable).toHaveAttribute('aria-disabled', 'true')
		await enable.dispatchEvent('click')
		expect(writes).toHaveLength(0)
		expect((await api.task(1)).done).toBe(true)

		const reopened = taskPatched(page, 1)
		await blocker.getByRole('button', {name: 'Reopen task'}).click()
		expect((await reopened).ok()).toBe(true)
		await expect(blocker).toHaveCount(0)
		expect((await api.task(1)).done).toBe(false)

		const enabled = routineResponse(page, 1, 'configure')
		await enable.click()
		expect((await enabled).ok()).toBe(true)
		const after = await api.task(1)
		expect(after.done).toBe(false)
		expect(after.routine?.enabled).toBe(true)
	})

	test('pausing blocks the check-in until the routine is resumed', async ({
		authenticatedPage: page,
		apiContext,
		userToken,
	}) => {
		await useAccountZone(apiContext, userToken)
		await TaskFactory.create(1, {id: 1, project_id: 1})
		const api = routineApi(apiContext, userToken)
		await api.configure(1, {enabled: true, paused: false, timezone: ZONE})
		const ui = detail(page)
		const writes = await recordRoutineWrites(page, 1)

		await page.goto('/tasks/1')
		await expect(ui.checkIn).toHaveText('Check in today')

		const paused = routineResponse(page, 1, 'configure')
		await ui.panel.getByRole('button', {name: 'Pause'}).click()
		expect((await paused).ok()).toBe(true)
		expect((await api.routine(1)).paused).toBe(true)
		await expect(ui.chip).toHaveAttribute('data-routine-status', 'paused')
		await expect(ui.checkIn).toHaveAttribute('aria-disabled', 'true')
		await expect(ui.pausedNote).toBeVisible()
		await expect(ui.done).toHaveCount(0)

		await ui.checkIn.dispatchEvent('click')
		await blur(page)
		await page.keyboard.press('t')

		const resumed = routineResponse(page, 1, 'configure')
		await ui.panel.getByRole('button', {name: 'Resume'}).click()
		expect((await resumed).ok()).toBe(true)
		// Requests leave in order: had the paused check-in sent anything, it would be recorded before the resume.
		expect(writes.map(write => [write.method, write.body?.paused ?? write.body?.completed])).toEqual([
			['PUT', true],
			['PUT', false],
		])
		expect((await api.routine(1)).completed_today).toBe(false)
		await expect(ui.checkIn).not.toHaveAttribute('aria-disabled', 'true')
		await expect(ui.pausedNote).toHaveCount(0)

		const checkedIn = routineResponse(page, 1, 'check-in')
		await ui.checkIn.click()
		expect((await checkedIn).ok()).toBe(true)
		await expect(ui.chip).toHaveAttribute('data-routine-status', 'done')
		expect((await api.task(1)).done).toBe(false)
	})

	test('turning the routine off brings Done back and keeps the history', async ({
		authenticatedPage: page,
		apiContext,
		userToken,
	}) => {
		await useAccountZone(apiContext, userToken)
		await TaskFactory.create(1, {id: 1, project_id: 1})
		const api = routineApi(apiContext, userToken)
		await api.configure(1, {enabled: true, paused: false, timezone: ZONE})
		await api.checkIn(1)
		const {date} = await api.routine(1)
		const ui = detail(page)

		await page.goto('/tasks/1')
		await expect(ui.repeatAction).toHaveAttribute('aria-disabled', 'true')

		await ui.panel.getByRole('button', {name: 'Turn off'}).click()
		const disabled = routineResponse(page, 1, 'configure')
		await page.getByRole('dialog').getByRole('button', {name: 'Do it!'}).click()
		expect((await disabled).ok()).toBe(true)

		await expect(ui.done).toContainText('Mark task done!')
		await expect(ui.checkIn).toHaveCount(0)
		await expect(ui.chip).toHaveCount(0)
		await expect(ui.repeatAction).not.toHaveAttribute('aria-disabled', 'true')
		const after = await api.task(1)
		expect(after.done).toBe(false)
		expect(after.routine?.enabled).toBe(false)

		// The history stays reachable after a reload, with the record made while the routine was on.
		await page.reload()
		await expect(ui.panel).toHaveAttribute('data-routine-mode', 'disabled')
		await ui.panel.getByRole('button', {name: 'View routine history'}).click()
		await expect(ui.panel.locator(`.routine-record[data-date="${date}"]`)).toBeVisible()
		expect((await api.history(1, date)).items.map(item => item.date)).toEqual([date])
	})

	test('read-only members see the routine and its history but no controls', async ({
		authenticatedPage: page,
		apiContext,
		currentUser,
	}) => {
		const [owner] = await UserFactory.create(1, {id: 2}, false)
		await ProjectFactory.create(1, {id: 1, owner_id: 2})
		await UserProjectFactory.create(1, {project_id: 1, user_id: currentUser.id, permission: 0})
		await TaskFactory.create(1, {id: 1, project_id: 1, created_by_id: 2})
		const {token: ownerToken} = await login(null, apiContext, owner)
		const api = routineApi(apiContext, ownerToken)
		await api.configure(1, {enabled: true, paused: false, timezone: 'UTC'})
		await api.checkIn(1)
		const {date} = await api.routine(1)
		const ui = detail(page)

		await page.goto('/tasks/1')
		await expect(ui.chip).toHaveAttribute('data-routine-status', 'done')
		await expect(ui.panel).toBeVisible()
		await expect(ui.checkIn).toHaveCount(0)
		await expect(ui.done).toHaveCount(0)
		await expect(ui.routineAction).toHaveCount(0)
		for (const name of ['Pause', 'Resume', 'Turn off', 'Change time zone', 'Turn on again']) {
			await expect(ui.panel.getByRole('button', {name, exact: true})).toHaveCount(0)
		}

		await ui.panel.getByRole('button', {name: 'View routine history'}).click()
		await expect(ui.panel.locator(`.routine-record[data-date="${date}"]`)).toContainText('by member #2')
	})

	test('the routine detail fits a 390px phone without sideways scrolling', async ({
		authenticatedPage: page,
		apiContext,
		userToken,
	}) => {
		await useAccountZone(apiContext, userToken)
		await TaskFactory.create(1, {id: 1, project_id: 1, title: 'Evening stretch'})
		const api = routineApi(apiContext, userToken)
		await api.configure(1, {enabled: true, paused: false, timezone: ZONE})
		await api.checkIn(1)
		const ui = detail(page)

		await page.setViewportSize({width: 390, height: 844})
		await page.goto('/tasks/1')
		await expect(ui.checkIn).toBeVisible()
		await ui.panel.getByRole('button', {name: 'View routine history'}).click()
		const calendar = ui.panel.locator('.routine-calendar')
		await expect(calendar).toBeVisible()
		await expect(calendar.locator('thead th')).toHaveCount(7)
		const cell = await calendar.locator('.routine-day').first().boundingBox()
		expect(cell?.height ?? 0).toBeGreaterThanOrEqual(36)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

		await ui.panel.getByRole('button', {name: 'Change time zone'}).click()
		await expect(ui.panel.getByRole('combobox', {name: 'Time zone'})).toBeVisible()
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	})

	test('an ordinary repeating task still completes through Done', async ({
		authenticatedPage: page,
		apiContext,
		userToken,
	}) => {
		const originalDue = new Date(Date.now() + 86_400_000)
		await TaskFactory.create(1, {
			id: 1,
			project_id: 1,
			due_date: originalDue.toISOString(),
			repeat_after: 86400,
		})
		const api = routineApi(apiContext, userToken)
		const ui = detail(page)
		const writes = await recordRoutineWrites(page, 1)

		await page.goto('/tasks/1')
		await expect(ui.checkIn).toHaveCount(0)
		await expect(ui.chip).toHaveCount(0)
		await expect(ui.panel).toHaveCount(0)
		await expect(ui.repeatAction).not.toHaveAttribute('aria-disabled', 'true')

		const completed = taskPatched(page, 1)
		await ui.done.filter({hasText: 'Mark task done!'}).click()
		expect((await completed).ok()).toBe(true)

		const after = await api.task(1)
		expect(after.done).toBe(false)
		expect(new Date(after.due_date).getTime() - originalDue.getTime()).toBeCloseTo(86_400_000, -4)
		expect(after.routine ?? null).toBeNull()
		expect(writes).toHaveLength(0)
	})
})
