import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises} from '@vue/test-utils'
import {clearUploads, uploadAwareFetch, uploads} from './uploadTransport'

class UploadXHR {
	static current: UploadXHR
	upload: {onprogress?: (event: {loaded: number; total: number; lengthComputable: boolean}) => void; onload?: () => void} = {}
	onload?: () => void
	onerror?: () => void
	onabort?: () => void
	status = 200
	statusText = 'OK'
	response = new TextEncoder().encode('{"success":[]}').buffer
	constructor() {UploadXHR.current = this}
	open() {}
	setRequestHeader() {}
	send() {}
	getAllResponseHeaders() {return 'Content-Type: application/json\r\n'}
	abort() {this.onabort?.()}
}

beforeEach(() => {
	vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'performance']})
	vi.stubGlobal('XMLHttpRequest', UploadXHR)
})
afterEach(() => {clearUploads(); vi.useRealTimers(); vi.unstubAllGlobals()})
function start(signal?: AbortSignal) {
	const form = new FormData()
	form.append('files', new File(['upload payload'], 'sample.txt', {type: 'text/plain'}))
	return uploadAwareFetch(new Request('http://localhost/api/v2/tasks/7/attachments', {method: 'POST', body: form, signal}))
}

describe('upload byte telemetry', () => {
	it('samples byte speed, reports a stall, and keeps processing separate from transfer completion', async () => {
		const request = start()
		void request.catch(() => {})
		await flushPromises()
		const xhr = UploadXHR.current
		xhr.upload.onprogress!({loaded: 1024, total: 4096, lengthComputable: true})
		vi.advanceTimersByTime(500)
		expect(uploads.value[0]).toMatchObject({loaded: 1024, total: 4096, bytesPerSecond: 2048, targetPath: '/api/v2/tasks/7/attachments'})
		vi.advanceTimersByTime(500)
		expect(uploads.value[0].bytesPerSecond).toBe(0)
		xhr.upload.onprogress!({loaded: 4096, total: 4096, lengthComputable: true})
		xhr.upload.onload!()
		expect(uploads.value[0]).toMatchObject({stage: 'processing', averageBytesPerSecond: 4096})
		vi.advanceTimersByTime(3000)
		expect(uploads.value[0]).toMatchObject({stage: 'processing', elapsedMs: 4000, averageBytesPerSecond: 4096})
		xhr.onload!()
		await request
		expect(uploads.value[0].stage).toBe('done')
		expect(vi.getTimerCount()).toBe(0)
	})
	it('clears sampling timers and private upload records when the account changes', async () => {
		const request = start()
		void request.catch(() => {})
		const rejected = expect(request).rejects.toMatchObject({name: 'AbortError'})
		await flushPromises()
		clearUploads()
		await rejected
		expect(uploads.value).toEqual([])
		expect(vi.getTimerCount()).toBe(0)
	})
	it('does not label a partial failure in an HTTP 200 response as completed', async () => {
		const request = start()
		void request.catch(() => {})
		await flushPromises()
		UploadXHR.current.response = new TextEncoder().encode('{"success":[],"errors":[{"message":"file rejected"}]}').buffer
		UploadXHR.current.onload!()
		await request
		expect(uploads.value[0].stage).toBe('error')
		expect(uploads.value[0].error).toBeTruthy()
		expect(vi.getTimerCount()).toBe(0)
	})
})
