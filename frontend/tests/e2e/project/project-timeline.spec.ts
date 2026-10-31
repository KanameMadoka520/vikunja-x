import type {Page} from '@playwright/test'

import {test, expect} from '../../support/fixtures'
import {ProjectFactory} from '../../factories/project'
import {TaskFactory} from '../../factories/task'
import {createDefaultViews} from './prepareProjects'

const YEAR = new Date().getUTCFullYear()
const at = (date: string) => `${date}T12:00:00Z`

async function seed() {
	const projects = [
		{id: 1, title: 'Website relaunch', hex_color: '1973ff'},
		{id: 2, title: 'Thesis writing', hex_color: '0f9d58'},
		{id: 3, title: 'Tax return', hex_color: '8e44ad', is_archived: true},
	]
	for (const [index, project] of projects.entries()) {
		await ProjectFactory.create(1, {owner_id: 1, ...project}, index === 0)
		await createDefaultViews(project.id, index * 4 + 1)
	}
	const tasks = [
		// Spans the whole current year: partly passed, partly still ahead.
		{id: 1, project_id: 1, title: 'Whole-year plan', start_date: at(`${YEAR}-01-01`), end_date: at(`${YEAR}-12-31`), percent_done: 0.5},
		// No dates: counted as missing, never drawn.
		{id: 2, project_id: 1, title: 'Undated idea'},
		// Done after 10 of its 20 scheduled days.
		{id: 3, project_id: 2, title: 'Draft chapters', start_date: at('2024-03-01'), end_date: at('2024-03-20'), done: true, done_at: at('2024-03-10'), percent_done: 1},
		{id: 4, project_id: 3, title: 'File the return', start_date: at(`${YEAR}-02-01`), end_date: at(`${YEAR}-02-10`)},
	]
	for (const [index, task] of tasks.entries()) {
		await TaskFactory.create(1, task, index === 0)
	}
}

const lane = (page: Page, title: string) => page.locator('.lane').filter({hasText: title})

// Elements on the page that animate layout or `all`, or take longer than the motion scale allows.
async function motionViolations(page: Page) {
	return page.evaluate(() => [...document.querySelectorAll('.project-history *')].flatMap(el => {
		const style = getComputedStyle(el)
		const durations = style.transitionDuration.split(',').map(value => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000))
		const properties = style.transitionProperty.split(',').map(value => value.trim())
		return properties.flatMap((property, index) => {
			const duration = durations[index % durations.length]
			if (!(duration > 0)) return []
			if (property === 'all' || duration > 250 || ['width', 'height', 'inline-size', 'block-size', 'top', 'left', 'margin', 'padding'].includes(property)) {
				return [`${el.className}: ${property} ${duration}ms`]
			}
			return []
		})
	}))
}

test.describe('Project timeline', () => {
	test.use({timezoneId: 'UTC'})

	test('shows dated work per project with progress apart from elapsed time', async ({authenticatedPage: page}) => {
		await seed()
		await page.setViewportSize({width: 1280, height: 900})
		await page.goto('/projects/history')

		await expect(page.getByRole('tab', {name: 'Timeline'})).toHaveAttribute('aria-selected', 'true')
		await expect(page.locator('.lane')).toHaveCount(2)
		const website = lane(page, 'Website relaunch')
		await expect(website.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
		await expect(website).toContainText('50% average progress')
		await expect(website).toContainText(`0 of 1 scheduled tasks in ${YEAR} done`)
		await expect(website.locator('.lane-span.is-elapsed')).toHaveCount(1)
		await expect(lane(page, 'Tax return')).toContainText('Archived')
		await expect(page.locator('.timeline-missing')).toContainText('1 task is not on the timeline')
		await expect(page.locator('.timeline-stat').filter({hasText: 'Projects with scheduled work'})).toContainText('2')
		expect(await motionViolations(page)).toEqual([])

		const status = page.getByRole('group', {name: 'Project status'})
		await status.getByRole('button', {name: 'Archived'}).click()
		await expect(page).toHaveURL(/status=archived/)
		await expect(page.locator('.lane')).toHaveCount(1)
		await expect(page.locator('.lane')).toContainText('Tax return')
		await status.getByRole('button', {name: 'Active'}).click()
		await expect(page.locator('.lane')).toHaveCount(1)
		await expect(page.locator('.lane')).toContainText('Website relaunch')
		await status.getByRole('button', {name: 'All'}).click()
		await expect(page.locator('.lane')).toHaveCount(2)

		// Picking a day narrows the lanes; the keyboard moves a week per column and Enter selects.
		const cell = page.locator(`[data-grid="year"] [data-date="${YEAR}-02-05"]`)
		await cell.click()
		await expect(page).toHaveURL(new RegExp(`day=${YEAR}-02-05`))
		await expect(page.locator('.lane')).toHaveCount(2)
		await expect(cell).toHaveAttribute('aria-selected', 'true')
		await cell.focus()
		await page.keyboard.press('ArrowRight')
		await expect(page.locator(`[data-grid="year"] [data-date="${YEAR}-02-12"]`)).toBeFocused()
		await page.keyboard.press('Enter')
		await expect(page).toHaveURL(new RegExp(`day=${YEAR}-02-12`))
		await expect(page.locator('.lane')).toHaveCount(1)
		await page.getByRole('button', {name: 'Show all days'}).first().click()
		await expect(page.locator('.lane')).toHaveCount(2)

		// Zooming to a month keeps every row but draws only that month.
		await page.getByRole('button', {name: 'Zoom to March', exact: false}).first().click()
		await expect(page).toHaveURL(/month=3/)
		await expect(lane(page, 'Tax return')).toContainText('Nothing scheduled in March')

		await page.getByRole('combobox', {name: 'Year'}).selectOption('2024')
		await expect(page).toHaveURL(/year=2024/)
		await expect(page).not.toHaveURL(/month=/)
		const thesis = lane(page, 'Thesis writing')
		await expect(thesis).toContainText('100% average progress')
		await expect(thesis).toContainText('10 of 20 scheduled days in 2024 counted as passed')
		await expect(page.locator('.lane')).toHaveCount(1)

		await page.getByRole('combobox', {name: 'Year'}).selectOption(String(YEAR - 5))
		await expect(page.getByText(`No scheduled work in ${YEAR - 5}.`)).toBeVisible()
		await page.getByRole('button', {name: 'Go to 2024'}).click()
		await expect(page).toHaveURL(/year=2024/)
		await expect(lane(page, 'Thesis writing')).toBeVisible()
	})

	test('updates from a task change without reloading the page', async ({authenticatedPage: page}) => {
		await seed()
		await page.setViewportSize({width: 1280, height: 900})
		await page.goto('/projects/history')
		await expect(lane(page, 'Website relaunch')).toContainText('50% average progress')
		await page.evaluate(() => {
			(window as unknown as {timelineMarker: number}).timelineMarker = 1
		})

		await lane(page, 'Website relaunch').getByRole('link', {name: 'Website relaunch'}).click()
		await expect(page).toHaveURL(/\/projects\/1\/1/)
		await page.locator('.single-task').filter({hasText: 'Whole-year plan'}).locator('.fancy-checkbox').click()
		await expect(page.locator('.global-notification')).toContainText('Success')
		await page.goBack()

		await expect(page).toHaveURL(/\/projects\/history/)
		await expect(lane(page, 'Website relaunch')).toContainText('100% average progress')
		await expect(lane(page, 'Website relaunch')).toContainText(`1 of 1 scheduled tasks in ${YEAR} done`)
		expect(await page.evaluate(() => (window as unknown as {timelineMarker?: number}).timelineMarker)).toBe(1)
	})

	test('lifecycle records stay available in their own tab', async ({authenticatedPage: page}) => {
		await seed()
		await page.goto('/projects/history')
		await page.getByRole('tab', {name: 'Timeline'}).focus()
		await page.keyboard.press('ArrowRight')
		await expect(page.getByRole('tab', {name: 'Status changes'})).toBeFocused()
		await page.keyboard.press('Enter')
		await expect(page).toHaveURL(/tab=lifecycle/)
		await expect(page.getByRole('tabpanel')).toBeVisible()
		await expect(page.locator('.lane')).toHaveCount(0)
	})
})

for (const width of [390, 320]) {
	test.describe(`Project timeline on a ${width}px touch screen`, () => {
		test.use({timezoneId: 'UTC', hasTouch: true, isMobile: true, viewport: {width, height: 844}})

		test(`stacks lanes and uses the month calendar at ${width}px`, async ({authenticatedPage: page}, testInfo) => {
			await seed()
			await page.goto('/projects/history?month=2')
			await expect(page.locator('[data-grid="year"]')).toBeHidden()
			const day = page.locator(`[data-grid="month"] [data-date="${YEAR}-02-05"]`)
			await day.tap()
			await expect(page).toHaveURL(new RegExp(`day=${YEAR}-02-05`))
			await expect(page.locator('.lane')).toHaveCount(2)
			const focus = lane(page, 'Website relaunch').locator('.lane-focus')
			const box = (await focus.boundingBox())!
			expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43.5)
			const fontSize = await page.locator('.timeline-search input').evaluate(el => parseFloat(getComputedStyle(el).fontSize))
			expect(fontSize).toBeGreaterThanOrEqual(16)
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
			await page.getByRole('button', {name: 'Next month'}).tap()
			await expect(page).toHaveURL(/month=3/)
			await page.screenshot({path: testInfo.outputPath(`timeline-${width}.png`), fullPage: true, animations: 'disabled'})
		})
	})
}
