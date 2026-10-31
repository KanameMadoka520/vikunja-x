import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {computed, defineComponent, type ComputedRef} from 'vue'
import {mount} from '@vue/test-utils'
import {QueryClient, VueQueryPlugin, useQuery} from '@tanstack/vue-query'
import type {Action} from '@/client/generated'
import {
	agentRunScope,
	conversationQuery,
	trackNewConversation,
	useAgentReceiptRefresh,
} from '@/client/queries/tcyConversations'
import {normalizeTask, taskKeys, type PaginatedTaskResponse} from '@/client/queries/tasks'
import {useAronaRunObserver} from './useAronaRunObserver'

const sdk = vi.hoisted(() => ({
	tcyAiConversationsRead: vi.fn(),
	tcyAiConversationsEvents: vi.fn(),
	tasksRead: vi.fn(),
}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({
	error: vi.fn(),
	success: vi.fn(),
}))
vi.mock('@/stores/auth', () => ({
	useAuthStore: () => ({info: {id: 1}}),
}))

const listKey = taskKeys.list({project: 1})

function update(changes: Record<string, unknown>): Action {
	return {
		tool: 'update_task',
		arguments: JSON.stringify({id: 3, ...changes}),
		result: JSON.stringify({id: 3, project_id: 1, title: 'Before', priority: 1, ...changes}),
		success: true,
	}
}

// A mutable stand-in for the server's conversation record.
type ServerConversation = {
	id: string
	turns: {
		id: string
		status: string
		result: {actions: Action[]}
	}[]
}

let server: ServerConversation
const listed = (client: QueryClient) => client.getQueryData<PaginatedTaskResponse>(listKey)!.items[0]
const reads = () => sdk.tcyAiConversationsRead.mock.calls.length
const streams = () => sdk.tcyAiConversationsEvents.mock.calls.length

// What TcyAssistant does for the conversation it shows (full page or floating panel).
const AssistantView = defineComponent({
	props: {
		chat: {
			type: String,
			required: true,
		},
	},
	setup(props) {
		const query = useQuery(computed(() => conversationQuery(props.chat)))
		useAgentReceiptRefresh(query.data)
		return () => null
	},
})

describe('Arona run observer', () => {
	let client: QueryClient
	let following: ComputedRef<string>
	const mounted: {unmount: () => void}[] = []

	function mountView(chat: string) {
		const wrapper = mount(AssistantView, {
			props: {chat},
			global: {plugins: [[VueQueryPlugin, {queryClient: client}]]},
		})
		mounted.push(wrapper)
		return wrapper
	}

	function mountObserver() {
		const wrapper = mount(defineComponent({
			setup() {
				following = useAronaRunObserver().following
				return () => null
			},
		}), {global: {plugins: [[VueQueryPlugin, {queryClient: client}]]}})
		mounted.push(wrapper)
		return wrapper
	}

	beforeEach(() => {
		vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']})
		vi.clearAllMocks()
		sessionStorage.clear()
		client = new QueryClient({defaultOptions: {queries: {retry: false}}})
		client.setQueryData<PaginatedTaskResponse>(listKey, {
			items: [normalizeTask({id: 3, project_id: 1, title: 'Before', priority: 1})],
			total: 1,
			page: 1,
			per_page: 50,
			total_pages: 1,
		})
		server = {
			id: 'c1',
			turns: [{
				id: 't1',
				status: 'running',
				result: {actions: [update({priority: 5})]},
			}],
		}
		sdk.tcyAiConversationsRead.mockImplementation(async () => ({data: structuredClone(server)}))
		// The event stream never connects here, so the observer relies on its polling fallback.
		sdk.tcyAiConversationsEvents.mockImplementation(({signal}: {signal: AbortSignal}) => new Promise((_, reject) => {
			signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
		}))
	})

	afterEach(() => {
		mounted.splice(0).forEach(wrapper => wrapper.unmount())
		client.clear()
		vi.useRealTimers()
	})

	it('takes over a running chat when its view goes away and applies each new receipt once', async () => {
		const view = mountView('c1')
		mountObserver()
		await vi.advanceTimersByTimeAsync(10)
		// The view shows the live chat: the observer neither streams nor polls it.
		expect(agentRunScope(client).live.value).toBe('c1')
		expect(following.value).toBe('')
		expect(reads()).toBe(1)
		expect(streams()).toBe(0)

		// The run continues after the user leaves the assistant.
		view.unmount()
		server.turns[0].result.actions.push(update({title: 'Renamed by Arona'}))
		await vi.advanceTimersByTimeAsync(10)
		expect(following.value).toBe('c1')
		expect(streams()).toBe(1)
		await vi.waitFor(() => expect(listed(client).title).toBe('Renamed by Arona'))
		// The receipt that existed when the chat was first seen is never replayed.
		expect(listed(client).priority).toBe(1)

		server.turns[0].status = 'completed'
		await vi.advanceTimersByTimeAsync(1000)
		expect(following.value).toBe('')
		expect(agentRunScope(client).live.value).toBe('')
		const settled = reads()
		await vi.advanceTimersByTimeAsync(5000)
		expect(reads()).toBe(settled)

		// Opening the chat again (floating panel, full page) replays nothing.
		mountView('c1')
		await vi.advanceTimersByTimeAsync(10)
		expect(client.getMutationCache().getAll()).toHaveLength(1)
	})

	it('hands a followed chat back to a view without applying a receipt twice', async () => {
		trackNewConversation(client, 'c1')
		agentRunScope(client).live.value = 'c1'
		mountObserver()
		await vi.advanceTimersByTimeAsync(10)
		expect(following.value).toBe('c1')
		await vi.waitFor(() => expect(listed(client).priority).toBe(5))

		mountView('c1')
		await vi.advanceTimersByTimeAsync(10)
		expect(following.value).toBe('')
		server.turns[0].result.actions.push(update({title: 'Renamed by Arona'}))
		await vi.advanceTimersByTimeAsync(1000)
		await vi.waitFor(() => expect(listed(client).title).toBe('Renamed by Arona'))
		// One plan per new receipt, whichever of the two saw it.
		expect(client.getMutationCache().getAll()).toHaveLength(2)
	})

	it('resumes following a run after a reload until the chat shows it finished', async () => {
		server.turns[0].status = 'completed'
		sessionStorage.setItem(`arona-live:${agentRunScope(client).context}`, 'c1')
		mountObserver()
		expect(following.value).toBe('c1')
		await vi.advanceTimersByTimeAsync(10)
		expect(reads()).toBe(1)
		expect(following.value).toBe('')
		expect(sessionStorage.getItem(`arona-live:${agentRunScope(client).context}`)).toBeNull()
		// First sighting after the reload: the old receipt is recorded, not replayed.
		expect(listed(client).priority).toBe(1)
	})

	it('stops following a conversation that no longer exists', async () => {
		sdk.tcyAiConversationsRead.mockRejectedValue(Object.assign(new Error('Not found'), {status: 404}))
		agentRunScope(client).live.value = 'gone'
		mountObserver()
		await vi.advanceTimersByTimeAsync(10)
		expect(following.value).toBe('')
	})
})
