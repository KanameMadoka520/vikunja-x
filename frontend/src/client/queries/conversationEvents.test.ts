import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {computed, defineComponent, type Ref} from 'vue'
import {mount} from '@vue/test-utils'
import {QueryClient, VueQueryPlugin, useQuery, type Query} from '@tanstack/vue-query'
import type {Conversation} from '@/client/generated'
import {HEALTHY_STREAM_MS, MAX_RETRY_MS, RETRY_MS, SILENT_STREAM_MS, useConversationEvents} from './conversationEvents'
import {conversationKeys, conversationQuery} from './tcyConversations'

const sdk = vi.hoisted(() => ({
	tcyAiConversationsEvents: vi.fn(),
	tcyAiConversationsRead: vi.fn(),
}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({
	error: vi.fn(),
	success: vi.fn(),
}))

type ServedStream = {
	send: (payload: object) => void
	close: () => void
	fail: () => void
}

let streams: ServedStream[]

// A server-sent event stream the test drives frame by frame; aborting the request errors it like fetch does.
function serveStream({signal}: {signal: AbortSignal}) {
	const encoder = new TextEncoder()
	let controller!: ReadableStreamDefaultController<Uint8Array>
	const data = new ReadableStream<Uint8Array>({
		start: value => {
			controller = value
		},
	})
	signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
	streams.push({
		send: payload => controller.enqueue(encoder.encode(`event: activity\ndata: ${JSON.stringify(payload)}\n\n`)),
		close: () => controller.close(),
		fail: () => controller.error(new TypeError('network error')),
	})
	return {data}
}

const running: Conversation = {
	id: 'c1',
	turns: [{
		id: 't1',
		status: 'running',
	}],
}

function mountEvents(client: QueryClient, poll = false) {
	let connected!: Ref<boolean>
	const wrapper = mount(defineComponent({
		setup() {
			const events = useConversationEvents('c1')
			connected = events.connected
			if (poll) useQuery(computed(() => conversationQuery('c1', events.connected.value)))
			return () => null
		},
	}), {global: {plugins: [[VueQueryPlugin, {queryClient: client}]]}})
	return {
		wrapper,
		connected: () => connected.value,
	}
}

const calls = () => sdk.tcyAiConversationsEvents.mock.calls.length

describe('conversation events', () => {
	let client: QueryClient

	beforeEach(() => {
		vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']})
		vi.clearAllMocks()
		streams = []
		client = new QueryClient({defaultOptions: {queries: {retry: false}}})
		sdk.tcyAiConversationsEvents.mockImplementation(async (options: {signal: AbortSignal}) => serveStream(options))
		sdk.tcyAiConversationsRead.mockImplementation(async () => ({data: running}))
	})

	afterEach(() => {
		client.clear()
		vi.useRealTimers()
	})

	it('reconnects at once after the server ends a healthy stream and stays live meanwhile', async () => {
		const {wrapper, connected} = mountEvents(client)
		await vi.advanceTimersByTimeAsync(10)
		expect(calls()).toBe(1)
		streams[0].send({compacting: false, compactions: []})
		await vi.advanceTimersByTimeAsync(10)
		expect(connected()).toBe(true)

		// The server cuts every stream after 25 seconds.
		await vi.advanceTimersByTimeAsync(25_000)
		streams[0].close()
		await vi.advanceTimersByTimeAsync(10)
		expect(calls()).toBe(2)
		expect(connected()).toBe(true)

		streams[1].send({compacting: false, compactions: []})
		await vi.advanceTimersByTimeAsync(SILENT_STREAM_MS + 10)
		expect(connected()).toBe(true)
		wrapper.unmount()
	})

	it('backs off when a stream ends at once without data instead of looping', async () => {
		sdk.tcyAiConversationsEvents.mockImplementation(async (options: {signal: AbortSignal}) => {
			const response = serveStream(options)
			streams.at(-1)!.close()
			return response
		})
		const {wrapper, connected} = mountEvents(client)
		await vi.advanceTimersByTimeAsync(10)
		expect(calls()).toBe(1)
		await vi.advanceTimersByTimeAsync(RETRY_MS - 20)
		expect(calls()).toBe(1)
		await vi.advanceTimersByTimeAsync(20)
		expect(calls()).toBe(2)
		// The second empty stream doubles the wait.
		await vi.advanceTimersByTimeAsync(RETRY_MS * 2 - 20)
		expect(calls()).toBe(2)
		await vi.advanceTimersByTimeAsync(20)
		expect(calls()).toBe(3)
		await vi.advanceTimersByTimeAsync(60_000)
		// 6s, 12s, 24s and then the cap: far from a request loop.
		expect(calls()).toBeLessThanOrEqual(7)
		expect(connected()).toBe(false)
		const before = calls()
		await vi.advanceTimersByTimeAsync(MAX_RETRY_MS)
		expect(calls()).toBe(before + 1)
		wrapper.unmount()
	})

	it('backs off after failed requests', async () => {
		sdk.tcyAiConversationsEvents.mockRejectedValue(new TypeError('Failed to fetch'))
		const {wrapper} = mountEvents(client)
		await vi.advanceTimersByTimeAsync(RETRY_MS * 3 + 10)
		// 1.5s and 3s waits: the third request starts at 4.5s.
		expect(calls()).toBe(3)
		wrapper.unmount()
	})

	it('keeps the steady retry cadence after a short stream that delivered state', async () => {
		sdk.tcyAiConversationsEvents.mockImplementation(async (options: {signal: AbortSignal}) => {
			const response = serveStream(options)
			streams.at(-1)!.send({compacting: false, compactions: []})
			streams.at(-1)!.close()
			return response
		})
		const {wrapper, connected} = mountEvents(client)
		await vi.advanceTimersByTimeAsync(10)
		expect(calls()).toBe(1)
		expect(connected()).toBe(false)
		await vi.advanceTimersByTimeAsync(RETRY_MS)
		expect(calls()).toBe(2)
		await vi.advanceTimersByTimeAsync(RETRY_MS)
		expect(calls()).toBe(3)
		wrapper.unmount()
	})

	it('drops the live state when a reconnect stays silent', async () => {
		const {wrapper, connected} = mountEvents(client)
		await vi.advanceTimersByTimeAsync(10)
		streams[0].send({compacting: false, compactions: []})
		await vi.advanceTimersByTimeAsync(HEALTHY_STREAM_MS)
		streams[0].close()
		await vi.advanceTimersByTimeAsync(10)
		expect(calls()).toBe(2)
		expect(connected()).toBe(true)
		await vi.advanceTimersByTimeAsync(SILENT_STREAM_MS)
		expect(connected()).toBe(false)
		wrapper.unmount()
	})

	it('merges streamed turns into the cached conversation', async () => {
		client.setQueryData(conversationKeys.detail('c1'), running)
		const {wrapper} = mountEvents(client)
		await vi.advanceTimersByTimeAsync(10)
		streams[0].send({
			turn: {
				id: 't1',
				status: 'completed',
			},
			compacting: false,
			compactions: [],
		})
		await vi.advanceTimersByTimeAsync(10)
		expect(client.getQueryData<Conversation>(conversationKeys.detail('c1'))?.turns).toEqual([{id: 't1', status: 'completed'}])
		wrapper.unmount()
	})

	it('skips the conversation poll while the stream is live and polls a running chat otherwise', async () => {
		const {wrapper} = mountEvents(client, true)
		await vi.advanceTimersByTimeAsync(10)
		expect(sdk.tcyAiConversationsRead).toHaveBeenCalledTimes(1)
		streams[0].send({compacting: false, compactions: []})
		await vi.advanceTimersByTimeAsync(5000)
		expect(sdk.tcyAiConversationsRead).toHaveBeenCalledTimes(1)

		sdk.tcyAiConversationsEvents.mockRejectedValue(new TypeError('Failed to fetch'))
		streams[0].fail()
		await vi.advanceTimersByTimeAsync(1010)
		expect(sdk.tcyAiConversationsRead).toHaveBeenCalledTimes(2)
		wrapper.unmount()
	})
})

describe('conversation polling fallback', () => {
	const interval = (streaming: boolean, data: Conversation) => {
		const option = conversationQuery('c1', streaming).refetchInterval as unknown as (query: Query<Conversation>) => number | false
		return option({state: {data}} as Query<Conversation>)
	}

	it('polls only a running or compacting conversation without a live stream', () => {
		expect(interval(false, running)).toBe(1000)
		expect(interval(false, {id: 'c1', compacting: true, turns: []})).toBe(1000)
		expect(interval(false, {id: 'c1', turns: [{id: 't1', status: 'completed'}]})).toBe(false)
		expect(interval(true, running)).toBe(false)
	})
})
