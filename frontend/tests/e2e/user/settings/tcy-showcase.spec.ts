import {test, expect} from '../../../support/fixtures'
import {setupApiUrl} from '../../../support/authenticateUser'

import {UserFactory} from '../../../factories/user'

test.use({currentUser: async ({apiContext}, use) => {
	const [user] = await UserFactory.create(1, {language: 'zh-CN'})
	await use(user)
}})

test('tcymc public page requires preview, keeps drafts private and can be withdrawn', async ({authenticatedPage: page, browser}) => {
	await page.goto('/user/settings/showcase')
	await expect(page.getByRole('heading', {name: '公开主页', exact: true})).toBeVisible()
	await page.getByLabel('页面地址').fill('tcy-e2e-public')
	await page.getByLabel('页面标题').fill('我的公开日程')
	await page.getByPlaceholder('写一段介绍，或者使用模板占位符嵌入公开日程。').fill('# 自定义内容\n\n欢迎朋友关注我的安排。')
	await expect(page.getByRole('button', {name: '发布当前预览'})).toBeDisabled()
	await page.getByRole('button', {name: '预览公开效果'}).click()
	await expect(page.getByRole('heading', {name: '外人看到的效果'})).toBeVisible()
	await expect(page.frameLocator('iframe').getByRole('heading', {name: '自定义内容'})).toBeVisible()
	await page.getByRole('button', {name: '发布当前预览'}).click()
	const publicLink = page.getByRole('link', {name: '查看公开页面 ↗'})
	await expect(publicLink).toBeVisible()
	const href = await publicLink.getAttribute('href')
	const guest = await browser.newContext({locale: 'zh-CN'})
	try {
		const visitor = await guest.newPage()
		await setupApiUrl(visitor)
		await visitor.goto(href!)
		await expect(visitor.getByRole('heading', {name: '我的公开日程'})).toBeVisible()
		await expect(visitor.getByRole('heading', {name: '可联系时间'})).toBeVisible()
		await expect(visitor.getByRole('link', {name: 'tcymc二次开发版'})).toBeVisible()
		await page.getByLabel('页面标题').fill('仅草稿可见')
		await page.getByRole('button', {name: '保存草稿'}).click()
		await expect(page.getByLabel('页面标题')).toHaveValue('仅草稿可见')
		await visitor.reload()
		await expect(visitor.getByRole('heading', {name: '我的公开日程'})).toBeVisible()
		await page.getByRole('button', {name: '撤下公开页面'}).click()
		await expect(page.getByText('尚未公开', {exact: true})).toBeVisible()
		await visitor.reload()
		await expect(visitor.getByRole('heading', {name: '页面未发布或暂时不可用'})).toBeVisible()
	} finally {
		await guest.close()
	}
})
