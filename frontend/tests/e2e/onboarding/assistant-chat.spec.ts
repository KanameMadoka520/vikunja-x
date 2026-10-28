import {test, expect} from '../../support/fixtures'
import type {Page} from '@playwright/test'

async function chatServer(page: Page, withReview = false, live = false) {
	await page.route('**/api/v2/ai/preferences', route => route.fulfill({json: {revision: 0, default_profile: 'ask', profiles: []}}))
	const reviews: any[] = []
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
		if (action === 'events') return route.fulfill({status: 200, contentType: 'text/event-stream', body: `event: activity\ndata: ${JSON.stringify({turn:c.turns.at(-1),compacting:c.compacting ?? false,compactions:c.compactions})}\n\n`})
		if (action === 'messages') {
			sends++
			c.title ||= body.message
			c.turns.push({id: crypto.randomUUID(), request_id: body.request_id, prompt: body.message, status: 'completed', result: {
				configuration: {connection_id: body.connection_id, project_id: body.project_id, mode: body.mode, approval: body.approval, allow_delete: body.allow_delete, write_project_ids: body.write_project_ids, max_rounds: body.max_rounds, max_operations: body.max_operations, timeout_seconds: body.timeout_seconds, token_budget: body.token_budget}, reply: '**Saved answer**', model: 'actual-fixture', requested_model: 'requested', protocol: 'anthropic', endpoint: 'https://fixture.example/v1/messages', system_prompt: 'Actual request prompt', duration_ms: 2000, first_token_ms: 125, first_text_ms: 500,
				usage: {input: 30, output: 20, reported: true, cached: 5, cache_reported: true},
				steps: [{round: 1, loaded_tools: ['list_projects', 'find_tools'], tool_schema_bytes: 1200, catalog_schema_bytes: 8000, catalog_tool_count: 20, model: 'actual-fixture', reasoning: 'Provider thinking fixture', text: 'Saved answer', duration_ms: 2000}],
				actions: [{round: 1, tool: 'list_projects', arguments: '{}', result: '{"items":[]}', success: true, duration_ms: 10}],
			}})
		}
		if (withReview && action === 'messages') {
			const turn = c.turns.at(-1)
			turn.status = 'awaiting_approval'; turn.result.reply = ''
			turn.result.trace_id = 'fixture-trace-123'; turn.result.pause = 'review'
			turn.result.budget = {rounds: 1, round_limit: 16, operations: 0, operation_limit: 40}
			turn.result.pending = {id: crypto.randomUUID(), tool: 'update_task', units: 1, arguments: '{"id":1,"title":"Private proposed title"}', before: '[{"id":1,"title":"Private old title"}]'}
		}
		if (action === 'review') {
			reviews.push(body)
			const turn = c.turns.at(-1)
			if (body.decision === 'edit') {
				turn.result.pending.id = crypto.randomUUID(); turn.result.pending.arguments = body.arguments
			} else {
				turn.status = 'completed'; turn.result.pause = ''; turn.result.reply = 'Saved after review'
				turn.result.actions = [{tool: 'update_task', round: 1, success: true, arguments: turn.result.pending.arguments, result: '{"description":"Private tool result","api_key":"never-share-this-credential"}', duration_ms: 12}]
				turn.result.pending = null
			}
		}
		if (live && action === 'messages') {
			const turn=c.turns.at(-1);turn.status='running';turn.started=new Date().toISOString();turn.result.reply='';turn.result.stage='model'
			turn.result.steps=[{round:1,started:new Date().toISOString(),model:'actual-fixture',streaming:true,reasoning:'Checking accessible projects as data arrives',text:'',output_characters:48,usage:{input:30,output:5,reported:true},tool_calls:[{id:'draft-1',function:{name:'list_projects',arguments:'{'}}]}];turn.result.actions=[]
			setTimeout(()=>{turn.status='completed';turn.result.reply='Saved after background execution';turn.result.stage='completed'},2500)
		}
		if (action === 'title') c.title = body.title
		if (action === 'compact') { c.compact_error='';c.compacting=true;setTimeout(()=>{c.compactions.push({through:c.turns.length,summary:'Kept compact summary',model:'actual-fixture',usage:{input:100,output:20,reported:true}});c.compacting=false},200) }
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
	return {conversations, reviews, sends: () => sends}
}

test('chat persists, exposes real run details, compacts and branches without replay', async ({authenticatedPage: page}) => {
	const server = await chatServer(page)
	await page.goto('/ai')
	await page.setViewportSize({width: 1440, height: 900})
	await expect(page.locator('.profile-switch select')).toHaveValue('ask')
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
	await expect(page.locator('.summary-banner')).toContainText('turn 5')
	await expect(page.locator('.chat-turn')).toHaveCount(5)
	await page.getByRole('button', {name: 'Branch from here'}).first().click()
	await expect(page.locator('.chat-turn')).toHaveCount(1)
	expect(server.sends()).toBe(5)
	expect(server.conversations.size).toBe(2)
	await page.getByRole('button', {name: 'Conversations', exact: true}).click()
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
	await page.getByRole('button', {name: 'Scenarios & preferences', exact: true}).click()
	await page.getByLabel('Working mode').selectOption('write')
	await page.getByLabel('Allow task deletion for this request').check()
	await page.getByRole('button', {name: 'Use for upcoming messages'}).click()
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

test('review can be edited and resumed; diagnostic export defaults to metadata on mobile', async ({authenticatedPage: page}) => {
	const server = await chatServer(page, true)
	await page.setViewportSize({width: 390, height: 844})
	await page.goto('/ai')
	await page.getByLabel('Your request').fill('Review me')
	await page.getByRole('button', {name: 'Send request', exact: true}).click()
	await expect(page.getByRole('heading', {name: 'Review this operation'})).toBeVisible()
	await expect(page.locator('.change-table')).toContainText('Private old title')
	await page.getByRole('button', {name: 'Edit this operation', exact: true}).click()
	await page.getByLabel('Edit arguments (JSON)').fill('{"id":1,"title":"Private edited title"}')
	await page.getByRole('button', {name: 'Update preview', exact: true}).click()
	await expect(page.locator('.change-table')).toContainText('Private edited title')
	expect(server.reviews.map(r => r.decision)).toEqual(['edit'])
	await page.getByRole('button', {name: 'Approve and continue', exact: true}).click()
	await expect(page.locator('.chat-markdown')).toHaveText('Saved after review')
	expect(server.reviews.map(r => r.decision)).toEqual(['edit', 'approve'])
	expect(server.sends()).toBe(1)
	await page.getByRole('button', {name: 'Inspect run diagnostics', exact: true}).click()
	const dialog = page.getByRole('dialog', {name: 'Errors and diagnostics'})
	await expect(dialog).toBeVisible()
	await expect(dialog.locator('pre')).toContainText('fixture-trace-123')
	await expect(dialog.locator('pre')).toContainText('tool_schema_bytes')
	await expect(dialog.locator('pre')).not.toContainText('Private edited title')
	await expect(dialog.locator('pre')).not.toContainText('Private tool result')
	await dialog.getByLabel('Include error details, tool arguments and results (may contain private content)').check()
	await expect(dialog.locator('pre')).toContainText('Private edited title')
	await expect(dialog.locator('pre')).not.toContainText('never-share-this-credential')
	await dialog.getByRole('button', {name: 'Copy diagnostic report', exact: true}).click()
	await expect(dialog.getByRole('button', {name: 'Copied', exact: true})).toBeVisible()
	const copied = await page.evaluate(() => navigator.clipboard.readText())
	expect(JSON.parse(copied).entry.metadata.trace_id).toBe('fixture-trace-123')
	expect(copied).not.toContain('never-share-this-credential')
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible()
	await page.reload(); await expect(page.locator('.chat-markdown')).toHaveText('Saved after review')
	expect(server.sends()).toBe(1)
})
test('proxy HTML errors produce a useful diagnostic instead of rendering the block page', async ({authenticatedPage: page}) => {
	await chatServer(page)
	await page.route('**/api/v2/ai/settings', route => route.fulfill({status: 403, contentType: 'text/html', body: '<!DOCTYPE html><html><title>Blocked</title><body>private-block-page-token</body></html>'}))
	await page.goto('/ai')
	await page.locator('.heading-actions').getByRole('button', {name: 'Errors and diagnostics', exact: true}).click()
	const dialog = page.getByRole('dialog', {name: 'Errors and diagnostics'})
	await expect(dialog.locator('pre')).toContainText('PROXY_HTML')
	await expect(dialog.locator('pre')).toContainText('/api/v2/ai/settings')
	await expect(dialog.locator('pre')).not.toContainText('private-block-page-token')
	await expect(dialog.locator('pre')).not.toContainText('<!DOCTYPE')
})


test('live thinking, real usage and tool drafts remain observable after leaving the page', async ({authenticatedPage:page})=>{
	const server=await chatServer(page,false,true)
	await page.goto('/ai')
	await page.getByLabel('Your request').fill('Live run')
	await page.getByLabel('Your request').press('Enter')
	await expect(page.locator('.live-run-panel')).toContainText('Receiving model stream')
	await expect(page.locator('.live-run-panel')).toContainText('30 Input')
	await page.locator('.execution > summary').click()
	await expect(page.locator('.reasoning')).toContainText('Checking accessible projects as data arrives')
	await expect(page.locator('.tool-draft')).toContainText('Receiving proposed tool arguments')
	const url=page.url()
	await page.goto('/')
	await expect.poll(()=>[...server.conversations.values()][0]?.turns[0]?.status).toBe('completed')
	await page.goto(url)
	await expect(page.locator('.chat-markdown')).toHaveText('Saved after background execution')
	expect(server.sends()).toBe(1)
})

test('failed compaction exposes provider termination and can retry without losing messages', async ({authenticatedPage: page}) => {
	const server = await chatServer(page)
	await page.goto('/ai')
	await page.getByLabel('Your request').fill('Preserve this original message')
	await page.getByLabel('Your request').press('Enter')
	await expect(page.locator('.chat-markdown')).toHaveText('Saved answer')
	const c = [...server.conversations.values()][0]
	c.compact_error = 'The model reached its output token limit before finishing.'
	c.compact_progress = {batch: 1, batches: 3, attempt: 2, duration_ms: 15200, protocol: 'anthropic', endpoint: 'https://fixture.example/v1/messages', error_code: 'MODEL_OUTPUT_LIMIT', usage: {reported: true, input: 200, output: 8192}, steps: [{round: 1, model: 'actual-fixture', http_status: 200, stop_reason: 'max_tokens', usage: {reported: true, output: 4096}}]}
	await page.reload()
	await expect(page.locator('.compact-progress')).toContainText('Batch 1/3 · Attempt 2/2')
	await expect(page.locator('.compact-progress')).toContainText('8392')
	await page.getByRole('button', {name: 'Compaction diagnostics', exact: true}).click()
	const dialog = page.getByRole('dialog', {name: 'Errors and diagnostics'})
	await expect(dialog.locator('pre')).toContainText('MODEL_OUTPUT_LIMIT')
	await expect(dialog.locator('pre')).toContainText('max_tokens')
	await expect(dialog.locator('pre')).not.toContainText('Preserve this original message')
	await page.keyboard.press('Escape')
	page.on('dialog', dialog => dialog.accept())
	await page.getByRole('button', {name: 'Retry compaction', exact: true}).click()
	await expect(page.locator('.summary-banner')).toContainText('Kept compact summary')
	await expect(page.locator('.compact-progress')).not.toContainText('did not finish')
	await expect(page.locator('.chat-markdown')).toHaveText('Saved answer')
	expect(c.turns).toHaveLength(1)
	expect(server.sends()).toBe(1)
})

for (const width of [320, 390]) {
	test(`first mobile visit ${width}px keeps installation promotion out of the chat composer`, async ({authenticatedPage: page}) => {
		await chatServer(page)
		await page.setViewportSize({width, height: 844})
		await page.addInitScript(() => localStorage.setItem('hideAddToHomeScreenMessage', 'false'))
		await page.goto('/')
		await expect(page.locator('.add-to-home-screen')).toBeVisible()
		await page.goto('/ai')
		await expect(page.getByLabel('Your request')).toBeVisible()
		await expect(page.locator('.add-to-home-screen')).toHaveCount(0)
		await page.getByLabel('Your request').fill('First visit draft')
		const box = await page.locator('.composer').boundingBox()
		expect(box!.y + box!.height).toBeLessThanOrEqual(844)
		await page.getByLabel('Your request').press('Enter')
		await expect(page.locator('.chat-markdown')).toHaveText('Saved answer')
	})
}

test('permission switching survives reload, uses current request settings and restores each conversation', async ({authenticatedPage: page}) => {
 const server = await chatServer(page)
 await page.goto('/ai')
 const profile = page.locator('.profile-switch select')
 const send = async (text: string) => {
  const request = page.waitForRequest(r => r.url().endsWith('/messages') && r.method() === 'POST')
  await page.getByLabel('Your request').fill(text)
  await page.getByLabel('Your request').press('Enter')
  const body = (await request).postDataJSON()
  await expect(page.getByLabel('Your request')).toHaveValue('')
  return body
 }
 expect((await send('Read first')).mode).toBe('read')
 const firstURL = page.url()
 await profile.selectOption('assist')
 await expect(page.getByRole('status').filter({hasText: 'Applied to the next message'})).toBeVisible()
 await page.reload()
 await expect(profile).toHaveValue('assist')
 expect((await send('Now write')).mode).toBe('write')
 const first = [...server.conversations.values()][0]
 expect(first.turns[0].result.configuration.mode).toBe('read')
 expect(first.turns[1].result.configuration.mode).toBe('write')
 // A clean tab restores the server's last effective settings, not the account read-only default.
 await page.evaluate(() => sessionStorage.clear())
 await page.reload()
 await expect(page.locator('.composer-hint')).toContainText('Next message:')
 await expect(page.locator('.composer-hint')).toContainText('Execute')
 await profile.selectOption('ask')
 expect((await send('Read again')).mode).toBe('read')
 const panelButton = page.getByRole('button', {name: 'Scenarios & preferences', exact: true})
 await panelButton.click()
 const panel = page.getByRole('dialog', {name: 'Scenarios & preferences'})
 await panel.getByRole('button', {name: /Plan & review Turn ideas/}).click()
 await panel.getByRole('button', {name: 'Use for upcoming messages'}).click()
 const write = await send('Use reviewed writes')
 expect(write.mode).toBe('write'); expect(write.approval).toBe('review')
 await page.goto('/ai')
 await expect(profile).toHaveValue('ask')
 expect((await send('Separate read conversation')).mode).toBe('read')
 await page.goto(firstURL)
 await expect(page.locator('.composer-hint')).toContainText(/Review/i)
 const restored = await send('Continue original')
 expect(restored.mode).toBe('write'); expect(restored.approval).toBe('review')
})

for (const width of [1440, 390]) {
 test(`sending is immediate and sources stay collapsed at ${width}px`, async ({authenticatedPage: page}, testInfo) => {
  const server = await chatServer(page)
  let unblock!: () => void
  const gate = new Promise<void>(resolve => { unblock = resolve })
  await page.route('**/ai/conversations/*/messages', async route => { await gate; await route.fallback() })
  await page.setViewportSize({width, height: 900})
  await page.goto('/ai')
  await page.getByLabel('Your request').fill('Show sources without blocking the composer')
  await page.getByLabel('Your request').press('Enter')
  await expect(page.locator('.user-message p')).toHaveText('Show sources without blocking the composer')
  await expect(page.getByLabel('Your request')).toHaveValue('')
  await expect(page.locator('.thinking-status')).toHaveText('Sending…')
  await page.locator('.chat-turn').evaluate(el => { el.setAttribute('data-identity-check', 'same-node') })
  unblock()
  await expect(page.locator('.chat-markdown')).toHaveText('Saved answer')
  await expect(page.locator('.chat-turn')).toHaveCount(1)
  await expect(page.locator('.chat-turn')).toHaveAttribute('data-identity-check', 'same-node')
  expect((await page.locator('.conversation-toolbar').boundingBox())!.height).toBeLessThan(65)
  const c = [...server.conversations.values()][0]
  c.turns[0].result.actions = [{round: 1, tool: 'web_search', success: true, search: {verified: true, protocol: 'deepseek', endpoint: 'https://api.deepseek.com/v1/tools/search', duration_ms: 123, sources: [{title: 'Vikunja documentation', url: 'https://vikunja.io/docs/'}, {title: 'Vue performance', url: 'https://vuejs.org/guide/best-practices/performance'}]}}]
  await page.reload()
  const evidence = page.locator('.assistant-message > .web-evidence')
  await expect(evidence.locator('.sources-disclosure')).not.toHaveAttribute('open')
  await expect(evidence.getByRole('link')).toHaveCount(0)
  await evidence.locator('.sources-disclosure > summary').click()
  await expect(evidence.getByRole('link', {name: 'Vikunja documentation'})).toBeVisible()
  await expect(evidence.locator('.source-diagnostics')).not.toHaveAttribute('open')
  await evidence.locator('.source-diagnostics > summary').click()
  await expect(evidence.locator('code')).toHaveText('https://api.deepseek.com/v1/tools/search')
  await evidence.locator('.sources-disclosure > summary').click()
  await expect(evidence.getByRole('link')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path: testInfo.outputPath(`chat-sources-${width}.png`), animations: 'disabled'})
 })
}

test('failed send restores the draft and removes the pending row', async ({authenticatedPage: page}) => {
 await chatServer(page)
 await page.route('**/ai/conversations/*/messages', route => route.fulfill({status: 503, json: {message: 'Fixture unavailable'}}))
 await page.goto('/ai')
 await page.getByLabel('Your request').fill('Keep this unsent draft')
 await page.getByLabel('Your request').press('Enter')
 await expect(page.getByText('The message could not be sent. Your draft has been kept.')).toBeVisible()
 await expect(page.getByLabel('Your request')).toHaveValue('Keep this unsent draft')
 await expect(page.locator('.chat-turn')).toHaveCount(0)
})
