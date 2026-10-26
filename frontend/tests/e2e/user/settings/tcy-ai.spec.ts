import {test, expect} from '../../../support/fixtures'

import {UserFactory} from '../../../factories/user'

test.use({currentUser: async ({apiContext}, use) => {
	const [user] = await UserFactory.create(1, {language: 'zh-CN'})
	await use(user)
}})

test('saves model roles without disclosing keys and opens the branded assistant', async ({authenticatedPage: page}) => {
	await page.goto('/user/settings/ai')
	await expect(page.getByRole('heading', {name: 'AI 与语音'})).toBeVisible()
	await page.getByRole('button', {name: '添加模型连接'}).click()
	await page.getByLabel('连接名称').fill('我的任务助手')
	await page.getByLabel('API 基础地址').fill('https://provider.example.com/v1')
	await page.getByLabel('模型 ID').fill('task-model')
	await page.getByLabel('API 密钥').fill('test-only-private-key')
	await page.getByLabel('使用非流式响应（默认开启流式）').check()
	await page.getByLabel('任务 AI 助手', {exact: false}).selectOption({label: '我的任务助手 · task-model'})
	const saved = page.waitForResponse(r => r.url().endsWith('/ai/settings') && r.request().method() === 'POST')
	await page.getByRole('button', {name: '保存配置'}).click()
	const response = await saved
	expect(response.ok()).toBeTruthy()
	expect(await response.text()).not.toContain('test-only-private-key')
	await page.reload()
	await expect(page.getByLabel('API 密钥')).toHaveValue('')
	await expect(page.getByLabel('使用非流式响应（默认开启流式）')).toBeChecked()
	await expect(page.getByLabel('连接名称')).toHaveValue('我的任务助手')
	await page.getByRole('link', {name: '打开 AI 助手'}).click()
	await expect(page.getByRole('heading', {name: 'AI 任务助手'})).toBeVisible()
	await expect(page.getByRole('link', {name: 'tcymc二次开发版'})).toHaveAttribute('href', 'https://github.com/KanameMadoka520/vikunja-x')
	await page.getByRole('button', {name: '场景与偏好', exact: true}).click()
	await page.getByLabel('工作方式').selectOption('read')
	await expect(page.getByLabel('本次允许删除任务')).toBeDisabled()
	await page.getByRole('button', {name: '用于接下来的对话'}).click()
	await page.getByRole('button', {name: '今天先做什么'}).click()
	await expect(page.getByLabel('你的指令')).toHaveValue(/列出我还未完成的任务/)
})
