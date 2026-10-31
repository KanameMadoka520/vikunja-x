import type {APIRequestContext, Page} from '@playwright/test'

import {test, expect} from '../../support/fixtures'
import {apiRootUrl} from '../../support/apiUrl'
import {login} from '../../support/authenticateUser'
import {BucketFactory} from '../../factories/bucket'
import {ProjectFactory} from '../../factories/project'
import {UserFactory} from '../../factories/user'
import {UserProjectFactory} from '../../factories/users_project'
import {createDefaultViews} from './prepareProjects'

const api = `${apiRootUrl(process.env.API_URL || 'http://localhost:3456')}/api/v2`

// createDefaultViews(1, 1): list 1, gantt 2, table 3, kanban 4.
const VIEWS = {list: 1, gantt: 2, table: 3, kanban: 4}

type Announcement = {
	project_id: number
	title: string
	content: string
	revision: number
	updated_by_id: number
	max_permission?: number
}

// Owned by the logged-in user (id 1) unless another owner is given.
async function seedProject(ownerId = 1) {
	await ProjectFactory.create(1, {id: 1, title: 'Launch', owner_id: ownerId})
	await createDefaultViews(1, 1)
	await BucketFactory.create(1, {id: 1, project_view_id: VIEWS.kanban})
}

function authorization(token: string) {
	return {Authorization: `Bearer ${token}`}
}

async function readAnnouncement(request: APIRequestContext, token: string): Promise<Announcement> {
	const response = await request.get(`${api}/projects/1/announcement`, {headers: authorization(token)})
	expect(response.ok()).toBe(true)
	return response.json()
}

// Seeds through the real API (table names are not part of the contract); sends the current revision.
async function writeAnnouncement(request: APIRequestContext, token: string, title: string, content: string): Promise<Announcement> {
	const {revision} = await readAnnouncement(request, token)
	const response = await request.put(`${api}/projects/1/announcement`, {
		headers: authorization(token),
		data: {title, content, revision},
	})
	expect(response.ok(), await response.text()).toBe(true)
	return response.json()
}

function isAnnouncementRequest(url: URL | string, projectId = 1) {
	return new URL(String(url)).pathname.endsWith(`/api/v2/projects/${projectId}/announcement`)
}

// Waits for the announcement read as well, so "nothing is shown" checks run against loaded data.
async function openView(page: Page, viewId: number) {
	const read = page.waitForResponse(response => response.request().method() === 'GET' && isAnnouncementRequest(response.url()))
	await page.goto(`/projects/1/${viewId}`)
	await read
}

async function switchView(page: Page, viewId: number) {
	const dropdown = page.locator('.switch-view-dropdown-trigger')
	if (await dropdown.isVisible()) await dropdown.click()
	await page.locator(`a[href="/projects/1/${viewId}"]:visible`).last().click()
	await expect(page).toHaveURL(new RegExp(`/projects/1/${viewId}`))
}

async function expectNoHorizontalOverflow(page: Page) {
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test.describe('Project announcement', () => {
	test('an empty announcement adds no space and only offers writers a small add entry', async ({authenticatedPage: page}) => {
		await seedProject()
		await openView(page, VIEWS.list)

		await expect(page.locator('.project-view-actions .project-announcement-add')).toBeVisible()
		await expect(page.locator('.project-announcement')).toHaveCount(0)
		await expect(page.locator('.project-view-banners')).toBeHidden()
	})

	test('a writer adds an announcement and every view shows it', async ({authenticatedPage: page, apiContext, userToken}) => {
		await seedProject()
		await openView(page, VIEWS.list)

		await page.locator('.project-announcement-add').click()
		const dialog = page.getByRole('dialog', {name: 'Add announcement'})
		await dialog.getByLabel('Title', {exact: true}).fill('Server maintenance')
		await dialog.locator('.tiptap__editor .ProseMirror[contenteditable="true"]').fill('Friday 18:00, about 30 minutes.')
		await dialog.getByRole('button', {name: 'Save', exact: true}).click()
		await expect(dialog).toBeHidden()

		const bar = page.locator('.project-announcement')
		await expect(bar.getByRole('heading', {name: 'Server maintenance'})).toBeVisible()
		await expect(bar).toContainText('Friday 18:00, about 30 minutes.')
		await expect(bar).toContainText('by you')
		await expect(page.locator('.project-announcement-add')).toHaveCount(0)

		const stored = await readAnnouncement(apiContext, userToken)
		expect(stored).toMatchObject({title: 'Server maintenance', revision: 1})
		expect(stored.content).toContain('Friday 18:00')

		for (const viewId of [VIEWS.kanban, VIEWS.table, VIEWS.gantt]) {
			await switchView(page, viewId)
			await expect(page.locator('.project-announcement')).toHaveCount(1)
			await expect(page.locator('.project-announcement')).toContainText('Server maintenance')
		}
	})

	test('collapsing is remembered across views and reloads until a new revision', async ({authenticatedPage: page, apiContext, userToken}) => {
		await seedProject()
		await writeAnnouncement(apiContext, userToken, '', '<p>Deploy freeze until Monday.</p><p>Ask in the channel first.</p>')
		await openView(page, VIEWS.list)

		const bar = page.locator('.project-announcement')
		const body = bar.locator('.project-announcement__body')
		// Without a title the bar falls back to a generic heading.
		await expect(bar.getByRole('heading')).toHaveText('Announcement')
		await expect(body).toBeVisible()

		await bar.getByRole('button', {name: 'Collapse'}).click()
		await expect(bar.getByRole('button', {name: 'Expand'})).toHaveAttribute('aria-expanded', 'false')
		await expect(body).toBeHidden()
		// Collapsed and untitled: the first line of text stands in for the title.
		await expect(bar.getByRole('heading')).toHaveText('Deploy freeze until Monday.')

		await switchView(page, VIEWS.kanban)
		await expect(page.locator('.project-announcement')).toBeVisible()
		await expect(page.locator('.project-announcement__body')).toBeHidden()

		await page.reload()
		await expect(page.locator('.project-announcement')).toBeVisible()
		await expect(page.locator('.project-announcement__body')).toBeHidden()

		// New content is never hidden by an old choice.
		await writeAnnouncement(apiContext, userToken, '', '<p>Freeze extended to Wednesday.</p>')
		await page.reload()
		await expect(page.locator('.project-announcement__body')).toBeVisible()
		await expect(page.locator('.project-announcement')).toContainText('Freeze extended to Wednesday.')
		await expect(page.locator('.project-announcement').getByRole('button', {name: 'Collapse'})).toHaveAttribute('aria-expanded', 'true')
	})

	test('editing saves the next revision and shows it expanded', async ({authenticatedPage: page, apiContext, userToken}) => {
		await seedProject()
		await writeAnnouncement(apiContext, userToken, 'Standup', '<p>Daily at 9:30.</p>')
		await openView(page, VIEWS.list)

		const bar = page.locator('.project-announcement')
		await bar.getByRole('button', {name: 'Collapse'}).click()
		await expect(bar.locator('.project-announcement__body')).toBeHidden()

		await bar.getByRole('button', {name: 'Edit announcement'}).click()
		const dialog = page.getByRole('dialog', {name: 'Edit announcement'})
		const title = dialog.getByLabel('Title', {exact: true})
		await expect(title).toHaveValue('Standup')
		// Nothing changed yet: nothing to save.
		await expect(dialog.getByRole('button', {name: 'Save', exact: true})).toBeDisabled()
		await title.fill('Standup moved to 10:00')
		await dialog.getByRole('button', {name: 'Save', exact: true}).click()
		await expect(dialog).toBeHidden()

		await expect(bar.getByRole('heading')).toHaveText('Standup moved to 10:00')
		await expect(bar.locator('.project-announcement__body')).toBeVisible()
		await expect(bar).toContainText('Daily at 9:30.')
		expect(await readAnnouncement(apiContext, userToken)).toMatchObject({title: 'Standup moved to 10:00', revision: 2})
	})

	test('removing asks first and brings back the add entry', async ({authenticatedPage: page, apiContext, userToken}) => {
		await seedProject()
		await writeAnnouncement(apiContext, userToken, 'Temporary', '<p>Gone soon.</p>')
		await openView(page, VIEWS.list)

		await page.locator('.project-announcement').getByRole('button', {name: 'Edit announcement'}).click()
		const dialog = page.getByRole('dialog', {name: 'Edit announcement'})
		await dialog.getByRole('button', {name: 'Remove announcement'}).click()
		const confirm = page.getByRole('dialog', {name: 'Remove this announcement?'})
		await expect(confirm).toBeVisible()
		await confirm.getByRole('button', {name: 'Do it!', exact: true}).click()

		await expect(dialog).toBeHidden()
		await expect(page.locator('.project-announcement')).toHaveCount(0)
		await expect(page.locator('.project-announcement-add')).toBeVisible()
		expect(await readAnnouncement(apiContext, userToken)).toMatchObject({title: '', content: '', revision: 2})
	})

	test('a reader sees the announcement without add or edit actions', async ({authenticatedPage: page, apiContext, currentUser}) => {
		const [owner] = await UserFactory.create(1, {id: 2}, false)
		await seedProject(owner.id)
		await UserProjectFactory.create(1, {id: 1, project_id: 1, user_id: currentUser.id, permission: 0})
		const {token: ownerToken} = await login(null, apiContext, owner)

		await openView(page, VIEWS.list)
		await expect(page.locator('.project-announcement-add')).toHaveCount(0)
		await expect(page.locator('.project-announcement')).toHaveCount(0)

		await writeAnnouncement(apiContext, ownerToken, 'Read me', '<p>For everyone on the project.</p>')
		await openView(page, VIEWS.list)
		const bar = page.locator('.project-announcement')
		await expect(bar).toContainText('Read me')
		// Someone else wrote it, and there is no user lookup by id: no name, no "by you".
		await expect(bar).not.toContainText('by you')
		await expect(bar.getByRole('button', {name: 'Edit announcement'})).toHaveCount(0)
		await expect(page.locator('.project-announcement-add')).toHaveCount(0)
		// Collapsing is personal, so readers have it too.
		await expect(bar.getByRole('button', {name: 'Collapse'})).toBeVisible()
	})

	test('an archived project shows its announcement read-only', async ({authenticatedPage: page, apiContext, userToken}) => {
		await seedProject()
		await writeAnnouncement(apiContext, userToken, 'Wrapped up', '<p>Kept for reference.</p>')
		const headers = authorization(userToken)
		const project = await (await apiContext.get(`${api}/projects/1`, {headers})).json()
		expect((await apiContext.put(`${api}/projects/1`, {headers, data: {...project, is_archived: true}})).ok()).toBe(true)

		await openView(page, VIEWS.list)
		const bar = page.locator('.project-announcement')
		await expect(bar).toContainText('Wrapped up')
		await expect(page.locator('.archived-notice')).toBeVisible()
		// The announcement leads the notice region.
		expect((await bar.boundingBox())!.y).toBeLessThan((await page.locator('.archived-notice').boundingBox())!.y)
		await expect(bar.getByRole('button', {name: 'Edit announcement'})).toHaveCount(0)
		await expect(page.locator('.project-announcement-add')).toHaveCount(0)

		const refused = await apiContext.put(`${api}/projects/1/announcement`, {
			headers,
			data: {title: 'Changed', content: '', revision: 1},
		})
		expect(refused.status()).toBe(412)
	})

	test('stored markup is sanitized on the way in and on the way out', async ({authenticatedPage: page, apiContext, userToken}) => {
		const dialogs: string[] = []
		page.on('dialog', dialog => {
			dialogs.push(dialog.message())
			void dialog.dismiss()
		})
		await seedProject()
		await writeAnnouncement(apiContext, userToken, 'Safe', '<p>Visible text</p><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><script>alert(1)</script>')
		const stored = await readAnnouncement(apiContext, userToken)
		expect(stored.content).not.toMatch(/<img|<script|javascript:/i)

		await openView(page, VIEWS.list)
		const content = page.locator('.project-announcement__content')
		await expect(content).toContainText('Visible text')
		await expect(content.locator('img, script, svg, iframe, style')).toHaveCount(0)
		await expect(content.locator('a[href^="javascript:" i]')).toHaveCount(0)
		expect(dialogs).toEqual([])
	})

	test('the client sanitizes even if the API hands out unsafe markup', async ({authenticatedPage: page, apiContext, userToken}) => {
		const dialogs: string[] = []
		page.on('dialog', dialog => {
			dialogs.push(dialog.message())
			void dialog.dismiss()
		})
		await seedProject()
		await writeAnnouncement(apiContext, userToken, 'Safe', '<p>placeholder</p>')
		// Defence in depth: replace the read's body after the server's own sanitizing.
		await page.route(url => isAnnouncementRequest(url), async route => {
			if (route.request().method() !== 'GET') {
				await route.continue()
				return
			}
			const response = await route.fetch()
			await route.fulfill({
				response,
				json: {
					...await response.json(),
					content: '<p>Visible text</p><img src=x onerror=alert(1)><img src="data:image/png;base64,AAAA"><a href="javascript:alert(1)">bad</a><script>alert(1)</script><svg onload=alert(1)></svg><form action="https://attacker.example"><input name="password"></form><p style="position:fixed;inset:0" class="button" id="app">styled</p><a href="https://example.com/docs" target="_self" rel="opener">docs</a>',
				},
			})
		})

		await openView(page, VIEWS.list)
		const content = page.locator('.project-announcement__content')
		await expect(content).toContainText('Visible text')
		await expect(content.locator('img, script, svg, iframe, style, form, input')).toHaveCount(0)
		await expect(content.locator('a[href^="javascript:" i]')).toHaveCount(0)
		await expect(content.locator('[style], [class], [id]')).toHaveCount(0)
		const docs = content.locator('a[href="https://example.com/docs"]')
		await expect(docs).toHaveAttribute('target', '_blank')
		await expect(docs).toHaveAttribute('rel', 'noopener noreferrer nofollow')
		expect(dialogs).toEqual([])
	})

	test('a conflicting save keeps the draft until the user decides', async ({authenticatedPage: page, apiContext, userToken}) => {
		await seedProject()
		await writeAnnouncement(apiContext, userToken, 'Original', '<p>First version.</p>')
		await openView(page, VIEWS.list)

		const bar = page.locator('.project-announcement')
		await bar.getByRole('button', {name: 'Edit announcement'}).click()
		const dialog = page.getByRole('dialog', {name: 'Edit announcement'})
		const title = dialog.getByLabel('Title', {exact: true})
		await title.fill('My draft title')

		// Someone else saves between opening the editor and saving it.
		await writeAnnouncement(apiContext, userToken, 'Their title', '<p>Their version.</p>')

		const conflict = page.waitForResponse(response => response.request().method() === 'PUT' && isAnnouncementRequest(response.url()))
		await dialog.getByRole('button', {name: 'Save', exact: true}).click()
		expect((await conflict).status()).toBe(409)

		await expect(dialog.getByRole('alert')).toContainText('Someone else updated the announcement')
		await expect(dialog.getByRole('region', {name: 'Latest version'})).toContainText('Their version.')
		await expect(title).toHaveValue('My draft title')
		await expect(dialog.getByRole('button', {name: 'Save', exact: true})).toBeDisabled()
		// The bar behind the dialog already shows what is on the server.
		await expect(bar).toContainText('Their title')

		await dialog.getByRole('button', {name: 'Keep my draft'}).click()
		await dialog.getByRole('button', {name: 'Save', exact: true}).click()
		await expect(dialog).toBeHidden()
		await expect(bar.getByRole('heading')).toHaveText('My draft title')

		const stored = await readAnnouncement(apiContext, userToken)
		expect(stored).toMatchObject({title: 'My draft title', revision: 3})
		// The whole draft won, including the content the user had not touched.
		expect(stored.content).toContain('First version.')
	})

	test('after a conflict the draft can be replaced by the latest version', async ({authenticatedPage: page, apiContext, userToken}) => {
		await seedProject()
		await writeAnnouncement(apiContext, userToken, 'Original', '<p>First version.</p>')
		await openView(page, VIEWS.list)

		await page.locator('.project-announcement').getByRole('button', {name: 'Edit announcement'}).click()
		const dialog = page.getByRole('dialog', {name: 'Edit announcement'})
		const title = dialog.getByLabel('Title', {exact: true})
		await title.fill('My draft title')
		await writeAnnouncement(apiContext, userToken, 'Their title', '<p>Their version.</p>')
		await dialog.getByRole('button', {name: 'Save', exact: true}).click()

		await dialog.getByRole('button', {name: 'Replace my draft with the latest version'}).click()
		await expect(dialog.getByRole('alert')).toHaveCount(0)
		await expect(title).toHaveValue('Their title')
		await expect(dialog.locator('.tiptap__editor')).toContainText('Their version.')
		// Identical to the server again: nothing to save.
		await expect(dialog.getByRole('button', {name: 'Save', exact: true})).toBeDisabled()
		expect((await readAnnouncement(apiContext, userToken)).revision).toBe(2)
	})

	test('fits a 390px phone without horizontal overflow', async ({authenticatedPage: page, apiContext, userToken}) => {
		await page.setViewportSize({width: 390, height: 844})
		await seedProject()
		await writeAnnouncement(
			apiContext,
			userToken,
			'A fairly long announcement title that has to wrap on a phone screen',
			`<p>https://example.com/${'very-long-path-segment-'.repeat(12)}</p><table><tbody><tr>${'<td>wide cell content</td>'.repeat(8)}</tr></tbody></table>`,
		)
		await openView(page, VIEWS.list)

		const bar = page.locator('.project-announcement')
		await expect(bar).toBeVisible()
		await expectNoHorizontalOverflow(page)
		const box = (await bar.boundingBox())!
		expect(box.x).toBeGreaterThanOrEqual(0)
		expect(box.x + box.width).toBeLessThanOrEqual(390)

		// One column: the actions wrap under the heading instead of squeezing it.
		const heading = (await bar.getByRole('heading').boundingBox())!
		const toggle = (await bar.getByRole('button', {name: 'Collapse'}).boundingBox())!
		expect(toggle.y).toBeGreaterThanOrEqual(heading.y + heading.height - 1)

		// By URL: on a phone the view switcher may have folded into its dropdown.
		await openView(page, VIEWS.kanban)
		await expect(page.locator('.project-announcement')).toBeVisible()
		await expectNoHorizontalOverflow(page)

		await page.locator('.project-announcement').getByRole('button', {name: 'Edit announcement'}).click()
		const dialog = page.getByRole('dialog', {name: 'Edit announcement'})
		await expect(dialog).toBeVisible()
		expect(await dialog.locator('.modal-container').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
	})
})
