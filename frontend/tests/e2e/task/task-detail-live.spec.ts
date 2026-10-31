import type {Page, WebSocket} from '@playwright/test'

import {test, expect} from '../../support/fixtures'
import {createProjects} from '../project/prepareProjects'
import {ProjectFactory} from '../../factories/project'
import {ProjectViewFactory} from '../../factories/project_view'
import {TaskFactory} from '../../factories/task'
import {UserFactory} from '../../factories/user'
import {UserProjectFactory} from '../../factories/users_project'
import {TEST_PASSWORD} from '../../support/constants'
import {updateUserSettings} from '../../support/updateUserSettings'

const YEAR = new Date().getUTCFullYear()
const at = (date: string) => `${date}T12:00:00Z`
// The API answers an unset date with the zero time instead of null.
const isUnset = (value: unknown) => !value || String(value).startsWith('0001-01-01')
const sameInstant = (value: unknown) => new Date(String(value)).toISOString()

type PatchOperation = {op: string, path: string, value: unknown}

const isTaskUrl = (url: URL, taskId: number) => url.pathname.endsWith(`/api/v2/tasks/${taskId}`)

// Records the JSON patch bodies the page sends for one task. Chromium reports no body for requests
// that are not intercepted, so the bodies are read in a pass-through route.
async function recordTaskPatches(page: Page, taskId: number) {
	const bodies: PatchOperation[][] = []
	await page.route(url => isTaskUrl(url, taskId), route => {
		if (route.request().method() === 'PATCH') {
			bodies.push(route.request().postDataJSON())
		}
		return route.fallback()
	})
	return bodies
}

function taskPatched(page: Page, taskId: number) {
	return page.waitForResponse(response => response.request().method() === 'PATCH'
		&& isTaskUrl(new URL(response.url()), taskId))
}

function detailField(page: Page, title: string) {
	return page.locator('.task-view .columns.details .column').filter({hasText: title})
}

test.describe('Task detail end date', () => {
	test.use({timezoneId: 'UTC'})

	test('clearing the end date stays cleared after a reload', async ({authenticatedPage: page, apiContext, userToken}) => {
		await createProjects(1)
		const [task] = await TaskFactory.create(1, {
			id: 1,
			project_id: 1,
			title: 'Plan the launch',
			start_date: at(`${YEAR}-03-02`),
			due_date: at(`${YEAR}-03-12`),
			end_date: at(`${YEAR}-03-20`),
		})
		const read = async () => (await apiContext.get(`/api/v2/tasks/${task.id}`, {
			headers: {Authorization: `Bearer ${userToken}`},
		})).json()
		const patches = await recordTaskPatches(page, task.id)

		await page.goto(`/tasks/${task.id}`)
		const end = detailField(page, 'End Date')
		await expect(end).toBeVisible()

		const saved = taskPatched(page, task.id)
		await end.getByRole('button', {name: 'Remove end date'}).click()
		expect((await saved).ok()).toBe(true)
		await expect(page.locator('.global-notification')).toContainText('Success')

		// Only the cleared end date goes out; the due date is never copied into it.
		expect(patches).toEqual([[{op: 'add', path: '/end_date', value: '0001-01-01T00:00:00Z'}]])
		await expect(end).toHaveCount(0)

		await page.reload()
		await expect(page.locator('.task-view h1[contenteditable]')).toContainText('Plan the launch')
		await expect(detailField(page, 'Due Date')).toBeVisible()
		await expect(detailField(page, 'End Date')).toHaveCount(0)

		const stored = await read()
		expect(isUnset(stored.end_date)).toBe(true)
		expect(sameInstant(stored.start_date)).toBe(sameInstant(at(`${YEAR}-03-02`)))
		expect(sameInstant(stored.due_date)).toBe(sameInstant(at(`${YEAR}-03-12`)))
	})

	test('a start and due date without an end date stay that way and the timeline ends at the due day', async ({
		authenticatedPage: page,
		apiContext,
		userToken,
	}) => {
		await createProjects(1)
		const [task] = await TaskFactory.create(1, {
			id: 1,
			project_id: 1,
			title: 'Write the brief',
			priority: 1,
			start_date: at(`${YEAR}-03-02`),
			due_date: at(`${YEAR}-03-12`),
		})
		const headers = {Authorization: `Bearer ${userToken}`}
		const patches = await recordTaskPatches(page, task.id)

		await page.goto(`/tasks/${task.id}`)
		await expect(detailField(page, 'End Date')).toHaveCount(0)

		// An unrelated save used to copy the due date into the empty end date.
		const saved = taskPatched(page, task.id)
		await detailField(page, 'Priority').locator('.select select').selectOption('Urgent')
		expect((await saved).ok()).toBe(true)
		await expect(page.locator('.global-notification')).toContainText('Success')
		expect(patches).toEqual([[{op: 'add', path: '/priority', value: 4}]])
		await expect(detailField(page, 'End Date')).toHaveCount(0)

		const stored = await (await apiContext.get(`/api/v2/tasks/${task.id}`, {headers})).json()
		expect(stored.priority).toBe(4)
		expect(isUnset(stored.end_date)).toBe(true)

		// The read model falls back to the due date for the end of the range.
		const timeline = await (await apiContext.get('/api/v2/projects/timeline', {
			headers,
			params: {
				year: YEAR,
				timezone: 'UTC',
			},
		})).json()
		expect(timeline.items.find((item: {id: number}) => item.id === 1)).toMatchObject({
			start_date: `${YEAR}-03-02`,
			end_date: `${YEAR}-03-12`,
			scheduled_days: 11,
		})

		await page.goto('/projects/history')
		const day = new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC',
		})
		const lane = page.locator('.lane').filter({hasText: 'First Project'})
		await expect(lane).toContainText(`${day.format(new Date(at(`${YEAR}-03-02`)))} – ${day.format(new Date(at(`${YEAR}-03-12`)))}`)
		await expect(lane).toContainText(`of 11 scheduled days in ${YEAR}`)

		const after = await (await apiContext.get(`/api/v2/tasks/${task.id}`, {headers})).json()
		expect(isUnset(after.end_date)).toBe(true)
	})
})

// Subscriptions are sent in one batch after auth, so the last event of the set proves all of them arrived.
function waitForSubscription(page: Page, event: string) {
	return page.waitForEvent('websocket').then((socket: WebSocket) => socket.waitForEvent('framesent', {
		predicate: frame => {
			const message = JSON.parse(frame.payload.toString())
			return message.action === 'subscribe' && message.event === event
		},
	}))
}

test.describe('Task detail live updates', () => {
	test.use({timezoneId: 'UTC'})

	test('a change made elsewhere shows in the open detail while the description draft stays', async ({
		authenticatedPage: page,
		apiContext,
		currentUser,
		userToken,
	}) => {
		const [owner] = await UserFactory.create(1, {id: 100}, false)
		const ownerLogin = await apiContext.post('login', {data: {
			username: owner.username,
			password: TEST_PASSWORD,
		}})
		const {token: ownerToken} = await ownerLogin.json()
		await ProjectFactory.create(1, {
			id: 100,
			owner_id: 100,
			title: 'Shared plans',
		}, false)
		await ProjectViewFactory.create(1, {
			id: 100,
			project_id: 100,
		}, false)
		await TaskFactory.create(1, {
			id: 100,
			project_id: 100,
			created_by_id: 100,
			title: 'Venue booking',
			description: '<p>Stored notes</p>',
			due_date: at('2030-06-15'),
		}, false)
		await UserProjectFactory.create(1, {
			id: 100,
			project_id: 100,
			user_id: currentUser.id,
			permission: 1,
		}, false)
		await updateUserSettings(apiContext, userToken, {frontend_settings: {
			date_display: 'yyyy-mm-dd',
			time_format: '24h',
		}})

		// Saves wait until the end, so the draft is certainly unsaved while the change arrives.
		// Each body is recorded as it arrives, before the hold.
		const patches: PatchOperation[][] = []
		let releaseSaves!: () => void
		const savesReleased = new Promise<void>(resolve => {releaseSaves = resolve})
		await page.route(url => isTaskUrl(url, 100), async route => {
			if (route.request().method() === 'PATCH') {
				patches.push(route.request().postDataJSON())
				await savesReleased
			}
			await route.continue()
		})
		let detailReads = 0
		page.on('request', request => {
			if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/api/v2/tasks/100')) detailReads++
		})

		const subscribed = waitForSubscription(page, 'notification.created')
		await page.goto('/tasks/100')
		await subscribed
		const due = detailField(page, 'Due Date').locator('.datepicker .show')
		await expect(due).toContainText('2030-06-15')

		await page.locator('.task-view .details.content.description .tiptap button.done-edit').click()
		const editor = page.locator('.task-view .details.content.description .tiptap__editor .tiptap.ProseMirror')
		await editor.fill('Draft written while the date moves')
		const readsBeforeChange = detailReads

		const headers = {Authorization: `Bearer ${ownerToken}`}
		const moved = await apiContext.patch('/api/v2/tasks/100', {
			headers: {
				...headers,
				'Content-Type': 'application/merge-patch+json',
			},
			data: {due_date: at('2031-02-20')},
		})
		expect(moved.ok()).toBe(true)
		// The mention notification reaches the page over the websocket and refetches the open task.
		const comment = await apiContext.put('tasks/100/comments', {
			headers,
			data: {comment: `<p>Moved the date <mention-user data-id="${currentUser.username}">@${currentUser.username}</mention-user></p>`},
		})
		expect(comment.ok()).toBe(true)

		await expect(due).toContainText('2031-02-20')
		expect(detailReads).toBeGreaterThan(readsBeforeChange)
		await expect(editor).toContainText('Draft written while the date moves')
		await expect(editor).not.toContainText('Stored notes')
		// Nothing but the description may go out, never the date this page loaded first.
		expect(patches.every(body => body.length === 1 && body[0].path === '/description')).toBe(true)

		releaseSaves()
		await page.locator('[data-cy="saveEditor"]').filter({hasText: 'Save'}).click()
		const read = async () => (await apiContext.get('/api/v2/tasks/100', {
			headers: {Authorization: `Bearer ${userToken}`},
		})).json()
		await expect.poll(async () => (await read()).description).toContain('Draft written while the date moves')

		expect(patches.map(body => body.map(operation => operation.path))).toEqual([['/description']])
		const stored = await read()
		expect(sameInstant(stored.due_date)).toBe(sameInstant(at('2031-02-20')))

		await page.reload()
		await expect(due).toContainText('2031-02-20')
		await expect(page.locator('.task-view .details.content.description')).toContainText('Draft written while the date moves')
	})
})
