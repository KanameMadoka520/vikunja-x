import {test, expect} from '../../support/fixtures'
import type {Page} from '@playwright/test'
import {guides, type GuideId} from '../../../src/helpers/guidedTour'
import {UserFactory} from '../../factories/user'
import {login} from '../../support/authenticateUser'

const dialogSelector = 'dialog.guided-tour[open]'

async function openGuide(page: Page, id: GuideId) {
	await page.locator('[data-tour="guide-help"]').click()
	await page.locator(`[data-guide="${id}"]`).click()
}

async function expectStep(page: Page, index: number, total: number) {
	const dialog = page.locator(dialogSelector)
	await expect(dialog.locator('.guide-progress')).toHaveText(`Step ${index + 1} of ${total}`)
	await expect(dialog.getByText(/This area is unavailable/)).toHaveCount(0)
	await expect(dialog.locator('.guide-shade > rect[stroke="white"]')).toBeVisible()
	await expect.poll(async () => {
		const panel = await dialog.locator('.guide-panel').boundingBox()
		const viewport = page.viewportSize()!
		return Boolean(panel && panel.x >= 0 && panel.y >= 0
			&& panel.x + panel.width <= viewport.width + 1
			&& panel.y + panel.height <= viewport.height + 1)
	}).toBe(true)
	await expect.poll(async () => {
		const panel = await dialog.locator('.guide-panel').boundingBox()
		const highlight = await dialog.locator('.guide-shade > rect[stroke="white"]').boundingBox()
		if (!panel || !highlight) return false
		return panel.y + panel.height <= highlight.y + 2 || panel.y >= highlight.y + highlight.height - 2
	}).toBe(true)
}

test.describe('Guided tours', () => {
	test('welcome can be dismissed, remembers the account and remains replayable', async ({authenticatedPage: page}) => {
		await page.goto('/')
		await expect(page.locator('.guide-welcome')).toBeVisible()
		await page.getByRole('button', {name: 'Dismiss this welcome message'}).click()
		await page.reload()
		await expect(page.locator('.guide-welcome')).toHaveCount(0)
		await page.locator('[data-tour="guide-help"]').click()
		await expect(page.locator(dialogSelector)).toHaveAccessibleName('What would you like to explore?')
		await expect(page.locator('.guide-choice')).toHaveCount(3)
		await page.keyboard.press('Escape')
		await expect(page.locator(dialogSelector)).toHaveCount(0)
		await expect(page.locator('[data-tour="guide-help"]')).toBeFocused()
	})

	for (const id of Object.keys(guides) as GuideId[]) {
		test(`completes and replays ${id} without writes or provider calls`, async ({authenticatedPage: page}) => {
			const writes: string[] = []
			page.on('request', request => {
				if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
					writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
				}
			})
			await page.goto('/')
			await openGuide(page, id)
			const total = guides[id].steps.length
			for (let index = 0; index < total; index++) {
				await expectStep(page, index, total)
				await page.locator(dialogSelector).getByRole('button', {name: index === total - 1 ? 'Finish' : 'Next', exact: true}).click()
			}
			await expect(page.locator(`[data-guide="${id}"] .guide-completed`)).toBeVisible()
			await page.locator(`[data-guide="${id}"]`).click()
			await expectStep(page, 0, total)
			await page.keyboard.press('Escape')
			await page.reload()
			await page.locator('[data-tour="guide-help"]').click()
			await expect(page.locator(`[data-guide="${id}"] .guide-completed`)).toBeVisible()
			// An initial account refresh is allowed; no tour-specific writes are allowed.
			expect(writes.filter(path => !path.endsWith('/user/token/refresh'))).toEqual([])
		})
	}

	test('Back returns to the earlier page and keyboard shortcuts stay inside the guide', async ({authenticatedPage: page}) => {
		await page.goto('/')
		await openGuide(page, 'ai')
		for (let index = 0; index < 5; index++) {
			await expectStep(page, index, 7)
			if (index < 4) await page.keyboard.press('ArrowRight')
		}
		await expect(page).toHaveURL(/\/ai$/)
		await page.keyboard.press('ArrowLeft')
		await expectStep(page, 3, 7)
		await expect(page).toHaveURL(/\/user\/settings\/ai$/)
		await page.keyboard.press('ControlOrMeta+k')
		await expect(page.locator('.quick-actions')).not.toBeVisible()
		for (let i = 0; i < 8; i++) {
			await page.keyboard.press('Tab')
			expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog.guided-tour')))).toBe(true)
		}
	})

	for (const width of [320, 390]) {
		test(`mobile ${width}px keeps every tour usable and restores the sidebar`, async ({authenticatedPage: page}) => {
			await page.setViewportSize({width, height: width === 320 ? 568 : 844})
			await page.goto('/')
			await expect(page.locator('.menu-container')).not.toHaveClass(/is-active/)
			for (const id of Object.keys(guides) as GuideId[]) {
				await openGuide(page, id)
				for (let index = 0; index < guides[id].steps.length; index++) {
					await expectStep(page, index, guides[id].steps.length)
					await page.locator(dialogSelector).getByRole('button', {
						name: index === guides[id].steps.length - 1 ? 'Finish' : 'Next',
						exact: true,
					}).click()
				}
				await page.keyboard.press('Escape')
				await expect(page.locator('.menu-container')).not.toHaveClass(/is-active/)
			}
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		})
	}

	test('missing content offers a way forward and Escape cancels pending navigation', async ({authenticatedPage: page}) => {
		await page.route('**/api/v2/ai/settings', route => route.fulfill({status: 503, body: '{}'}))
		await page.goto('/')
		await page.locator('[data-tour="guide-help"]').click()
		// Remove an optional anchor to exercise graceful fallback without altering app data.
		await page.locator('[data-tour="nav-overview"]').evaluate(el => el.removeAttribute('data-tour'))
		await page.locator('[data-guide="basics"]').click()
		await expect(page.locator(dialogSelector).getByText(/This area is unavailable/)).toBeVisible({timeout: 8000})
		await page.getByRole('button', {name: 'Next', exact: true}).click()
		await expectStep(page, 1, 9)
		await page.keyboard.press('Escape')
		await expect(page.locator(dialogSelector)).toHaveCount(0)
		await page.locator('[data-tour="guide-help"]').click()
		await page.locator('[data-guide="ai"]').click()
		await page.keyboard.press('Escape')
		await expect(page.locator(dialogSelector)).toHaveCount(0)
	})

	test('new accounts have separate progress and Chinese copy', async ({authenticatedPage: page, apiContext}) => {
		await page.goto('/')
		await page.getByRole('button', {name: 'Dismiss this welcome message'}).click()
		const [other] = await UserFactory.create(1, {id: 2, language: 'zh-CN'}, false)
		await login(page, apiContext, other)
		await page.reload()
		await expect(page.locator('.guide-welcome')).toContainText('花几分钟，熟悉你的工作台')
		await page.locator('[data-tour="guide-help"]').click()
		await expect(page.locator(dialogSelector)).toHaveAccessibleName('想先了解哪一部分？')
		await page.locator('[data-guide="basics"]').click()
		await expect(page.locator('.guide-progress')).toHaveText('第 1 步，共 9 步')
		await page.getByRole('button', {name: '跳过教程', exact: true}).click()
		await expect(page.locator(dialogSelector)).toHaveCount(0)
	})
})
