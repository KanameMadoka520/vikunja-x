import {test, expect} from '../../support/fixtures'
import type {Page} from '@playwright/test'

async function chatServer(page: Page) {
	const conversations = new Map<string, any>()
	let sends = 0
	await page.route('**/api/v2/ai/settings', route => route.fulfill({json: {
		connections: [{id: 'model', name: 'Fixture', kind: 'chat', protocol: 'anthropic', base_url: 'https://fixture.example/v1', model: 'requested', has_key: true}],
		assistant: 'model', transcription: '', cleanup: '',
	}}))
	await page.route('**/api/v2/ai/prompt?*', route => route.fulfill({json: {system_prompt: 'Actual built-in fixture prompt', tool_schema: '[list_projects]'}}))
	await page.route('**/api/v2/ai/conversations**', async route => {
		const request = route.request()
		const pathname = new URL(request.url()).pathname
		const [, id, action] = pathname.split('/ai/conversations')[1].split('/')
		const body = request.postDataJSON()
		if (!id) {
			if (request.method() === 'GET') return route.fulfill({json: {items: [...conversations.values()].map(c => ({...c, turn_count: c.turns.length})), total_pages: 1, total: conversations.size}})
			const c = {id: crypto.randomUUID(), title: '', turns: [], compactions: []}
			conversations.set(c.id, c)
			return route.fulfill({status: 201, json: c})
		}
		const c = conversations.get(id)!
		if (action === 'messages') {
			sends++
			c.title ||= body.message
			c.turns.push({id: crypto.randomUUID(), prompt: body.message, status: 'completed', result: {
				reply: '**Saved answer**', model: 'actual-fixture', requested_model: 'requested', protocol: 'anthropic', endpoint: 'https://fixture.example/v1/messages', system_prompt: 'Actual request prompt', duration_ms: 2000, first_token_ms: 125, first_text_ms: 500,
				usage: {input: 30, output: 20, reported: true, cached: 5, cache_reported: true},
				steps: [{round: 1, model: 'actual-fixture', reasoning: 'Provider thinking fixture', text: 'Saved answer', duration_ms: 2000}],
				actions: [{round: 1, tool: 'list_projects', arguments: '{}', result: '{"items":[]}', success: true, duration_ms: 10}],
			}})
		}
		if (action === 'title') c.title = body.title
		if (action === 'compact') c.compactions.push({through: c.turns.length - 4, summary: 'Kept compact summary', model: 'actual-fixture', usage: {input: 100, output: 20, reported: true}})
		if (action === 'fork') {
			const branch = structuredClone(c)
			branch.id = crypto.randomUUID()
			branch.parent_id = id
			branch.turns = branch.turns.slice(0, branch.turns.findIndex((t: any) => t.id === body.turn_id) + 1)
			branch.compactions = []
			conversations.set(branch.id, branch)
			return route.fulfill({status: 201, json: branch})
		}
		if (request.method() === 'DELETE') { conversations.delete(id); return route.fulfill({status: 204}) }
		return route.fulfill({status: request.method() === 'GET' ? 200 : 201, json: c})
	})
	return {conversations, sends: () => sends}
}

test('chat persists, exposes real run details, compacts and branches without replay', async ({authenticatedPage: page}) => {
	const server = await chatServer(page)
	await page.goto('/ai')
	await page.setViewportSize({width: 1440, height: 900})
	await expect(page.getByLabel('Working mode')).toHaveValue('read')
	await page.getByLabel('Your request').fill('First message')
	await page.getByLabel('Your request').press('Enter')
	await expect(page.locator('.chat-markdown')).toHaveText('Saved answer')
	await page.evaluate(() => scrollTo(0, 0))
	expect((await page.locator('.composer').boundingBox())!.y + (await page.locator('.composer').boundingBox())!.height).toBeLessThanOrEqual(900)
	await expect(page.locator('.run-metrics')).toContainText('0.13 s')
	await expect(page.locator('.run-metrics')).toContainText('0.50 s')
	await expect(page.locator('.run-metrics')).toContainText('Total tokens: 50')
	await page.locator('.execution > summary').click()
	await page.locator('.reasoning > summary').click()
	await expect(page.locator('.reasoning')).toContainText('Provider thinking fixture')
	await page.locator('.tool-step > summary').click()
	await expect(page.locator('.tool-step')).toContainText('Actual tool result')
	await page.locator('.request-details > summary').click()
	await expect(page.locator('.request-details')).toContainText('Actual request prompt')
	await expect(page.locator('.request-details')).toContainText('https://fixture.example/v1/messages')
	await page.reload()
	await expect(page.locator('.chat-markdown')).toHaveText('Saved answer')
	await page.getByLabel('Rename conversation', {exact: true}).click()
	await page.getByRole('textbox', {name: 'Rename conversation'}).fill('Reusable session')
	await page.getByRole('button', {name: 'Save', exact: true}).click()
	await expect(page.locator('.conversation-title')).toHaveText('Reusable session')
	for (let n = 0; n < 4; n++) {
		await page.getByLabel('Your request').fill(`Message ${n + 2}`)
		await page.getByLabel('Your request').press('Enter')
		await expect(page.locator('.chat-turn')).toHaveCount(n + 2)
	}
	page.on('dialog', dialog => dialog.accept())
	await page.getByRole('button', {name: 'Compact context', exact: true}).click()
	await expect(page.locator('.summary-banner')).toContainText('turn 1')
	await expect(page.locator('.chat-turn')).toHaveCount(5)
	await page.getByRole('button', {name: 'Branch from here'}).first().click()
	await expect(page.locator('.chat-turn')).toHaveCount(1)
	expect(server.sends()).toBe(5)
	expect(server.conversations.size).toBe(2)
	await page.locator('.system-prompt > summary').click()
	await expect(page.locator('.system-prompt')).toContainText('Actual built-in fixture prompt')
})

test('send keeps the clicked permissions and preserves a new draft while creation is pending', async ({authenticatedPage: page}) => {
 await chatServer(page)
 let release!: () => void
 const gate = new Promise<void>(resolve => { release = resolve })
 await page.route('**/api/v2/ai/conversations', async route => {
  if (route.request().method() === 'POST') await gate
  await route.fallback()
 })
 await page.goto('/ai')
 await page.getByLabel('Your request').fill('Original read-only instruction')
 const creating = page.waitForRequest(r => r.url().endsWith('/ai/conversations') && r.method() === 'POST')
 await page.getByRole('button', {name: 'Send request', exact: true}).click()
 await creating
 await page.locator('.context-options > summary').click()
 await page.getByLabel('Working mode').selectOption('write')
 await page.getByLabel('Allow task deletion for this request').check()
 await page.getByLabel('Your request').fill('New draft for later')
 const sent = page.waitForRequest(r => r.url().endsWith('/messages'))
 release()
 const request = (await sent).postDataJSON()
 expect(request.message).toBe('Original read-only instruction')
 expect(request.mode).toBe('read')
 expect(request.allow_delete).toBe(false)
 await expect(page.locator('.chat-markdown')).toHaveText('Saved answer')
 await expect(page.getByLabel('Your request')).toHaveValue('New draft for later')
})

for (const width of [320, 390]) {
	test(`mobile chat ${width}px keeps composer, saved history and multiline input usable`, async ({authenticatedPage: page}) => {
		await chatServer(page)
		await page.setViewportSize({width, height: 844})
		await page.goto('/ai')
		await page.getByLabel('Your request').fill('First line')
		await page.getByLabel('Your request').press('Shift+Enter')
		await page.getByLabel('Your request').press('a')
		await expect(page.getByLabel('Your request')).toHaveValue('First line\na')
		await page.getByRole('button', {name: 'Send request', exact: true}).click()
		await expect(page.locator('.chat-markdown')).toHaveText('Saved answer')
		await page.getByRole('button', {name: 'Conversations', exact: true}).click()
		await expect(page.locator('.chat-sidebar')).toBeVisible()
		await page.getByRole('button', {name: /First line/}).click()
		await expect(page.locator('.chat-sidebar')).not.toBeVisible()
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	})
}
