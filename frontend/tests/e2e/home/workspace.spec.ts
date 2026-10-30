import type {Page} from '@playwright/test'

import {test, expect} from '../../support/fixtures'
import {apiRootUrl} from '../../support/apiUrl'
import {updateUserSettings} from '../../support/updateUserSettings'
import {ProjectFactory} from '../../factories/project'
import {TaskFactory} from '../../factories/task'
import {LabelFactory} from '../../factories/labels'
import {LabelTaskFactory} from '../../factories/label_task'
import {UserFactory} from '../../factories/user'
import {createDefaultViews} from '../project/prepareProjects'

const api = `${apiRootUrl(process.env.API_URL || 'http://localhost:3456')}/api/v2`
const TZ = 'Asia/Shanghai'

// Noon (or `hour`) of the calendar day `offset` days from today in Shanghai, which has no DST.
function shanghaiDay(offset: number, hour = 12): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: TZ,
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
	}).formatToParts(new Date())
	const part = (type: string) => Number(parts.find(p => p.type === type)!.value)
	return new Date(Date.UTC(part('year'), part('month') - 1, part('day') + offset, hour - 8)).toISOString()
}

async function seedProject(id = 1, title = 'Personal') {
	await ProjectFactory.create(1, {
		id,
		title,
	})
	await createDefaultViews(id, (id - 1) * 4 + 1)
}

async function seedTasks() {
	await seedProject()
	const tasks = [
		{
			id: 1,
			title: 'Pay the invoice',
			due_date: shanghaiDay(-2),
		},
		{
			id: 2,
			title: 'Call the plumber',
			due_date: shanghaiDay(0, 23),
		},
		{
			id: 3,
			title: 'Water the plants',
			due_date: shanghaiDay(3),
		},
		{
			id: 4,
			title: 'Renew the passport',
			due_date: shanghaiDay(20),
		},
		{
			id: 5,
			title: 'Read a book',
		},
		{
			id: 6,
			title: 'Already finished',
			done: true,
			due_date: shanghaiDay(0),
		},
	]
	for (const [index, task] of tasks.entries()) {
		await TaskFactory.create(1, {
			project_id: 1,
			...task,
		}, index === 0)
	}
}

async function dismissWelcome(page: Page, name: string) {
	const dismiss = page.getByRole('button', {name})
	// The first-run card appears once the user settings arrive; give it a moment.
	if (await dismiss.waitFor({state: 'visible', timeout: 5000}).then(() => true, () => false)) {
		await dismiss.click()
		await expect(dismiss).toHaveCount(0)
	}
}

async function expectNoHorizontalOverflow(page: Page) {
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test.describe('Workspace (en)', () => {
	test.use({
		timezoneId: TZ,
		currentUser: async ({apiContext}, use) => {
			// Depend on apiContext so the factories have their request context first.
			void apiContext
			const [user] = await UserFactory.create(1, {timezone: TZ})
			await use(user)
		},
	})

	test('groups open tasks by due date and switches between real views', async ({authenticatedPage: page, userToken}, testInfo) => {
		await seedTasks()
		await page.goto('/')
		await dismissWelcome(page, 'Dismiss this welcome message')

		const panel = page.getByTestId('showTasks')
		await expect(panel.locator('.task-group')).toHaveCount(5)
		await expect(panel.locator('.task-group-heading')).toHaveText([
			/Overdue\s*1/,
			/Today\s*1/,
			/Next 7 days\s*1/,
			/Later\s*1/,
			/No due date\s*1/,
		])
		await expect(panel.locator('[data-group="overdue"]')).toContainText('Pay the invoice')
		await expect(panel.locator('[data-group="today"]')).toContainText('Call the plumber')
		await expect(panel).not.toContainText('Already finished')
		await expect(panel.locator('.workspace-tasks-count')).toHaveText('5 tasks')
		await expect(page).toHaveTitle(/Workspace/)
		await page.screenshot({path: testInfo.outputPath('workspace-desktop.png'), fullPage: true, animations: 'disabled', mask: [page.locator('.workspace-header')]})

		await page.getByRole('button', {name: 'Today', exact: true}).click()
		await expect(page.getByRole('button', {name: 'Today', exact: true})).toHaveAttribute('aria-pressed', 'true')
		await expect(panel.locator('.single-task')).toHaveCount(1)
		await expect(panel).toContainText('Call the plumber')

		await page.getByRole('button', {name: 'Overdue', exact: true}).click()
		await expect(panel.locator('.single-task')).toHaveCount(1)
		await expect(panel).toContainText('Pay the invoice')

		// The chosen view survives a reload.
		await page.reload()
		await expect(page.getByRole('button', {name: 'Overdue', exact: true})).toHaveAttribute('aria-pressed', 'true')
		await expect(panel.locator('.single-task')).toHaveCount(1)

		await panel.locator('.single-task', {hasText: 'Pay the invoice'}).locator('.fancy-checkbox').click()
		await expect(panel.locator('.workspace-empty')).toContainText('Nothing is overdue')
		const stored = await page.request.get(`${api}/tasks/1`, {headers: {Authorization: `Bearer ${userToken}`}})
		expect((await stored.json()).done).toBe(true)
	})

	test('confirms a quick capture that the selected view does not show', async ({authenticatedPage: page, apiContext, userToken}) => {
		await seedProject()
		await updateUserSettings(apiContext, userToken, {default_project_id: 1})
		await page.goto('/')
		await dismissWelcome(page, 'Dismiss this welcome message')
		const today = page.getByRole('button', {name: 'Today', exact: true})
		await today.click()

		const capture = page.locator('.add-task-textarea')
		await capture.fill('Buy oat milk')
		const created = page.waitForResponse(response => response.url().includes('/tasks/bulk')
			&& response.request().method() === 'POST')
		await capture.press('Enter')
		await created

		const feedback = page.getByRole('status').filter({hasText: 'Added 1 task'})
		await expect(feedback).toContainText('Buy oat milk')
		await expect(feedback).toContainText('It isn\'t shown in this view.')
		await expect(feedback.getByRole('link', {name: 'Buy oat milk'})).toHaveAttribute('href', /\/tasks\/\d+/)
		// The capture does not silently change the chosen view.
		await expect(today).toHaveAttribute('aria-pressed', 'true')

		await feedback.getByRole('button', {name: 'Show all open tasks'}).focus()
		await page.keyboard.press('Enter')
		await expect(page.getByRole('button', {name: 'All open', exact: true})).toHaveAttribute('aria-pressed', 'true')
		await expect(page.getByTestId('showTasks')).toContainText('Buy oat milk')
		// The confirmation and its link stay, and keyboard focus lands on the link.
		await expect(feedback).not.toContainText('It isn\'t shown in this view.')
		await expect(feedback.getByRole('link', {name: 'Buy oat milk'})).toBeFocused()
	})

	test('shows honest totals and pages through more than one page of tasks', async ({authenticatedPage: page}) => {
		await seedProject()
		await TaskFactory.create(55, {
			project_id: 1,
			title: (i: number) => `Bulk task ${i + 1}`,
		})
		await page.goto('/')
		await dismissWelcome(page, 'Dismiss this welcome message')

		const panel = page.getByTestId('showTasks')
		await expect(panel.locator('.workspace-tasks-count')).toHaveText('55 tasks')
		await expect(panel.locator('.workspace-page-status')).toHaveText('1–50 of 55')
		await expect(panel.locator('.single-task')).toHaveCount(50)
		const next = panel.getByRole('button', {name: 'Next'})
		await next.focus()
		await page.keyboard.press('Enter')
		await expect(panel.locator('.workspace-page-status')).toHaveText('51–55 of 55')
		await expect(panel.locator('.single-task')).toHaveCount(5)
		// The previous page stays on screen while the next one loads, so focus is kept.
		await expect(next).toBeFocused()
	})

	test('opens a label\'s tasks in the all-open view whatever view was remembered', async ({authenticatedPage: page}) => {
		await seedTasks()
		await LabelFactory.create(1, {id: 1, title: 'Errands'})
		await LabelTaskFactory.create(2, {label_id: 1, task_id: (i: number) => [3, 5][i - 1]})
		await page.goto('/')
		await dismissWelcome(page, 'Dismiss this welcome message')
		await page.getByRole('button', {name: 'Overdue', exact: true}).click()
		await expect(page.getByRole('button', {name: 'Overdue', exact: true})).toHaveAttribute('aria-pressed', 'true')

		await page.goto('/?labels=1')
		const panel = page.getByTestId('showTasks')
		await expect(page.getByRole('button', {name: 'All open', exact: true})).toHaveAttribute('aria-pressed', 'true')
		await expect(panel.locator('.single-task')).toHaveCount(2)
		await expect(panel).toContainText('Water the plants')
		await expect(panel).toContainText('Read a book')

		// The date views stay available on top of the label filter.
		await page.getByRole('button', {name: 'Today', exact: true}).click()
		await expect(page.getByRole('button', {name: 'Today', exact: true})).toHaveAttribute('aria-pressed', 'true')
		await expect(panel.locator('.workspace-empty')).toContainText('Nothing is due today.')
	})

	test('offers to create a project when only pseudo projects exist', async ({authenticatedPage: page}) => {
		await page.goto('/')
		await dismissWelcome(page, 'Dismiss this welcome message')
		const empty = page.locator('[data-empty="no-projects"]')
		await expect(empty).toContainText('Create a project first')
		await empty.getByRole('link', {name: 'New project'}).click()
		await expect(page).toHaveURL(/\/projects\/new/)
	})

	test('explains an empty today view and links to upcoming', async ({authenticatedPage: page}) => {
		await seedProject()
		await TaskFactory.create(1, {
			id: 1,
			project_id: 1,
			title: 'Someday task',
		})
		await page.goto('/')
		await dismissWelcome(page, 'Dismiss this welcome message')
		await page.getByRole('button', {name: 'Today', exact: true}).click()
		const panel = page.getByTestId('showTasks')
		await expect(panel.locator('.workspace-empty')).toContainText('Nothing is due today.')
		await panel.getByRole('link', {name: 'See what\'s coming up'}).click()
		await expect(page).toHaveURL(/\/tasks\/by\/upcoming/)
	})

	test('keeps recent projects and review entry points one step away', async ({authenticatedPage: page}) => {
		await seedProject(1, 'Garden')
		await page.goto('/projects/1/1')
		await page.waitForFunction(() => JSON.parse(localStorage.getItem('projectHistory') || '[]').length > 0)
		await page.locator('nav.menu.top-menu a').filter({hasText: 'Workspace'}).click()
		await dismissWelcome(page, 'Dismiss this welcome message')

		await expect(page.locator('.recent-projects')).toContainText('Garden')
		const side = page.getByRole('complementary', {name: 'Recent projects and shortcuts'})
		await expect(side.getByRole('link', {name: /Arona/})).toHaveAttribute('href', '/ai')
		await side.getByRole('link', {name: /Project year in review/}).click()
		await expect(page).toHaveURL(/\/projects\/history/)
	})

	test('is reachable by keyboard and keeps the g o shortcut', async ({authenticatedPage: page}) => {
		await seedTasks()
		await page.goto('/')
		await dismissWelcome(page, 'Dismiss this welcome message')
		await expect(page.getByTestId('showTasks').locator('.single-task').first()).toBeVisible()

		const reached: string[] = []
		for (let i = 0; i < 80 && reached.length < 3; i++) {
			await page.keyboard.press('Tab')
			const id = await page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null
				if (el?.matches('.add-task-textarea')) return 'capture'
				if (el?.matches('.segment')) return `chip:${el.textContent?.trim()}`
				if (el?.matches('.task-link')) return 'task'
				return ''
			})
			if (id !== '' && !reached.some(entry => entry.split(':')[0] === id.split(':')[0])) {
				reached.push(id)
			}
		}
		expect(reached).toEqual([
			'capture',
			'chip:All open',
			'task',
		])

		const allOpen = page.getByRole('button', {name: 'All open', exact: true})
		await allOpen.focus()
		await page.keyboard.press('ArrowRight')
		const today = page.getByRole('button', {name: 'Today', exact: true})
		await expect(today).toBeFocused()
		// Arrow keys only move focus; selection needs Enter or Space.
		await expect(today).toHaveAttribute('aria-pressed', 'false')
		await page.keyboard.press('Enter')
		await expect(today).toHaveAttribute('aria-pressed', 'true')

		await page.goto('/projects')
		await page.locator('#main-content').focus()
		await page.keyboard.press('g')
		await page.keyboard.press('o')
		await expect(page).toHaveURL(/\/$/)
	})
})

test.describe('Workspace (zh-CN, mobile)', () => {
	test.use({
		locale: 'zh-CN',
		timezoneId: TZ,
		currentUser: async ({apiContext}, use) => {
			// Depend on apiContext so the factories have their request context first.
			void apiContext
			const [user] = await UserFactory.create(1, {
				language: 'zh-CN',
				timezone: TZ,
			})
			await use(user)
		},
	})

	for (const width of [320, 390]) {
		for (const scheme of ['light', 'dark'] as const) {
			test(`workspace and drawer work at ${width}px in ${scheme} mode`, async ({authenticatedPage: page, apiContext, userToken}, testInfo) => {
				await seedTasks()
				await updateUserSettings(apiContext, userToken, {frontend_settings: {color_schema: scheme}})
				await page.emulateMedia({
					colorScheme: scheme,
					reducedMotion: 'reduce',
				})
				await page.setViewportSize({
					width,
					height: width === 320 ? 568 : 844,
				})
				await page.goto('/')

				// First-run card: text keeps a readable width and the call to action sits below it.
				const welcome = page.locator('.guide-welcome')
				await expect(welcome).toBeVisible()
				const card = (await welcome.boundingBox())!
				const text = (await welcome.locator('> div').boundingBox())!
				const cta = (await welcome.locator('.guide-button.primary').boundingBox())!
				expect(text.width).toBeGreaterThan(card.width * 0.6)
				expect(cta.y).toBeGreaterThanOrEqual(text.y + text.height - 1)
				expect(card.x + card.width).toBeLessThanOrEqual(width)
				await page.screenshot({path: testInfo.outputPath(`welcome-${width}-${scheme}.png`), animations: 'disabled'})
				await welcome.getByRole('button', {name: '不再显示首次提示'}).click()
				await expect(welcome).toHaveCount(0)

				await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${scheme}\\b`))
				const panel = page.getByTestId('showTasks')
				await expect(panel.locator('[data-group="overdue"] .task-group-heading')).toContainText('已逾期')
				await expect(page.getByRole('button', {name: '全部待办', exact: true})).toHaveAttribute('aria-pressed', 'true')
				await expect(page.getByRole('button', {name: '今天', exact: true})).toBeVisible()
				await expect(page.getByRole('link', {name: /阿罗娜/}).last()).toBeVisible()
				await expectNoHorizontalOverflow(page)
				await page.screenshot({
					path: testInfo.outputPath(`workspace-${width}-${scheme}.png`),
					fullPage: true,
					animations: 'disabled',
					mask: [page.locator('.workspace-header')],
				})

				const menuButton = page.locator('button.menu-show-button:visible')
				await menuButton.click()
				const drawer = page.locator('.menu-container')
				await expect(drawer).toHaveClass(/is-active/)
				await expect(drawer.getByText('记录与回顾')).toBeVisible()
				await expect(drawer.getByText('整理', {exact: true})).toBeVisible()
				await expect(drawer.getByRole('link', {name: '工作台'})).toHaveAttribute('aria-current', 'page')
				await expect(drawer.getByRole('link', {name: '近期'})).toBeVisible()
				await page.screenshot({path: testInfo.outputPath(`drawer-${width}-${scheme}.png`), animations: 'disabled'})

				await page.keyboard.press('Escape')
				await expect(drawer).not.toHaveClass(/is-active/)
				await expect(menuButton).toBeFocused()
				// A closed drawer must not keep its links in the tab order.
				await expect.poll(() => drawer.evaluate(el => getComputedStyle(el).visibility)).toBe('hidden')
			})
		}
	}
})
