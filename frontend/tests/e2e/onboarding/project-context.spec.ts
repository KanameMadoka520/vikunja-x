import {test, expect} from '../../support/fixtures'
import {createProjects} from '../project/prepareProjects'
import {TaskFactory} from '../../factories/task'
import type {Page} from '@playwright/test'

async function navigate(page: Page, path: string) {
	if (!await page.locator('.menu-container').evaluate(el => el.classList.contains('is-active'))) {
		await page.locator('button.menu-show-button:visible').click()
	}
	await page.locator(`.menu-container a[href="${path}"]`).first().click()
	await expect(page).toHaveURL(new RegExp(`${path}$`))
}

for (const width of [1440, 390]) {
	test(`project context stays meaningful through SPA navigation at ${width}px`, async ({authenticatedPage: page}, testInfo) => {
		test.setTimeout(90_000)
		await createProjects(1)
		await TaskFactory.create(1, {title: 'Task with project context'})
		await page.setViewportSize({width, height: 900})
		await page.goto('/projects/1/settings/background')
		await page.getByRole('button', {name: 'Aurora · Waves'}).click()
		await page.getByRole('dialog', {name: 'Choose how to upload images'}).getByRole('button', {name: 'Upload images', exact: true}).click()
		await expect(page.locator('.cover-preview img')).toBeVisible()
		await page.goto('/projects/1/1')
		const header = page.locator('.navbar .project-title-wrapper')
		await expect(header).toContainText('First Project')
		await expect(page.locator('.app-container')).toHaveClass(/has-background/)
		// No reloads: this was missed by the previous direct-navigation checks.
		for (const path of ['/ai', '/drive', '/tasks/by/upcoming']) {
			await navigate(page, path)
			await expect(header.filter({hasText: 'First Project'})).toHaveCount(0)
			await expect(page.locator('.navbar .project-title-dropdown')).toHaveCount(0)
			await expect(page.locator('.app-container')).not.toHaveClass(/has-background/)
			await expect(page.locator('.app-container-background')).not.toHaveClass(/is-visible/)
			await expect(page.locator('.vikunja-loading')).not.toBeVisible()
			await page.screenshot({path: testInfo.outputPath(`global-${width}-${path.split('/').at(-1)}.png`), animations: 'disabled'})
			await page.goBack()
			await expect(page).toHaveURL(/\/projects\/1\/1$/)
			await expect(header).toContainText('First Project')
			await expect(page.locator('.app-container')).toHaveClass(/has-background/)
		}
		await page.getByText('Task with project context', {exact: true}).click()
		await expect(page).toHaveURL(/\/tasks\/1$/)
		await expect(header).toContainText('First Project')
		await page.goBack()
		await expect(header).toContainText('First Project')
		await header.getByRole('button', {name: 'Open project settings menu'}).click()
		await expect(page.getByRole('link', {name: 'Background settings'})).toBeVisible()
	})
}
