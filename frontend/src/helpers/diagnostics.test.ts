import {beforeEach, describe, expect, it, vi} from 'vitest'
import {captureHttpDiagnostic, clearDiagnostics, diagnosticReport, diagnostics, openAgentDiagnostic, redactDiagnostic, safeDiagnosticURL} from './diagnostics'
import type {ChatTurn} from '@/client/generated'
const session = vi.hoisted(() => ({id: 1}))
vi.mock('@/client/requestContext', () => ({captureClientRequestContext: () => ({identity: {id: session.id, type: 1}, authSessionEpoch: 1, apiBaseUrl: '/api/v2'}), isRequestContextAbort: (e: unknown) => (e as Error)?.name === 'AbortError'}))
beforeEach(() => { session.id = 1; clearDiagnostics() })
describe('diagnostic reports', () => {
	it('strips credentials, query strings, raw audio and nested keys', () => {
		const result = JSON.stringify(redactDiagnostic({api_key: 'plain-private-value', authorization: 'Bearer secret-value', nested: {audio: 'raw-audio'}, detail: 'Bearer other-secret sk-private123456 github_pat_private987654 token=hidden-value https://user:pass@example.com/v1/messages?key=query-secret#private'}))
		for (const secret of ['plain-private-value', 'secret-value', 'raw-audio', 'other-secret', 'sk-private123456', 'github_pat_private987654', 'hidden-value', 'query-secret', 'user:pass']) expect(result).not.toContain(secret)
		expect(result).toContain('https://example.com/v1/messages')
		expect(safeDiagnosticURL('https://user:pass@example.com/path?key=secret')).toBe('https://example.com/path')
	})
	it('exports operation metadata without business content unless opted in', () => {
		openAgentDiagnostic({id: 'turn', status: 'failed', prompt: 'private user prompt', result: {trace_id: 'trace', error_code: 'EXECUTION_FAILED', error: 'technical detail', model: 'model', endpoint: 'https://provider.example/v1/messages?key=hidden', system_prompt: 'private system', actions: [{tool: 'update_task', arguments: '{"title":"private task title"}', result: '{"api_key":"secret-value","description":"private result"}', success: false}]}} as ChatTurn)
		const entry = diagnostics.value[0]
		const normal = diagnosticReport(entry)
		expect(normal).toContain('trace')
		for (const text of ['private user prompt', 'private task title', 'private result', 'private system', 'technical detail', 'hidden', 'secret-value']) expect(normal).not.toContain(text)
		const detailed = diagnosticReport(entry, true)
		expect(detailed).toContain('private task title')
		// JSON embedded in tool strings also needs recursive credential redaction.
		expect(detailed).not.toContain('secret-value')
	})
	it('deduplicates polling failures, bounds memory and fences users', () => {
		const request = new Request('https://example.com/api/v2/tasks?filter=private')
		for (let i = 0; i < 3; i++) captureHttpDiagnostic(new Error('failed'), new Response('', {status: 503}), request)
		expect(diagnostics.value).toHaveLength(1)
		expect(diagnostics.value[0].count).toBe(3)
		for (let i = 0; i < 40; i++) captureHttpDiagnostic(new Error('failed'), new Response('', {status: 503}), new Request(`https://example.com/api/v2/tasks/${i}`))
		expect(diagnostics.value).toHaveLength(30)
		session.id = 2
		captureHttpDiagnostic(new Error('new user'), new Response('', {status: 500}), request)
		expect(diagnostics.value).toHaveLength(1)
		expect(diagnostics.value[0].detail).toBe('new user')
	})
})
