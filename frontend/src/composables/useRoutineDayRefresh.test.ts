import {beforeEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h, ref} from 'vue'
import {mount} from '@vue/test-utils'
import {QueryClient, QueryObserver, VueQueryPlugin} from '@tanstack/vue-query'
import type {Task} from '@/client/generated'
import {normalizeTask, taskKeys, type PaginatedTaskResponse} from '@/client/queries/tasks'
import {useRoutineDayRefresh} from './useRoutineDayRefresh'

const sdk = vi.hoisted(() => ({
	taskRoutineRead: vi.fn(),
}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({
	error: vi.fn(),
	success: vi.fn(),
}))
const clock = vi.hoisted(() => ({now: null as unknown as {value: Date}}))
vi.mock('@/composables/useGlobalNow', () => ({
	useGlobalNow: () => ({now: clock.now, update: vi.fn()}),
}))

const listKey = taskKeys.list({project: 1})
const ended = {enabled: true, paused: false, timezone: 'UTC', date: '2020-01-01', completed_today: true,
	completed_at: '2020-01-01T08:00:00Z', next_reset_at: '2020-01-02T00:00:00Z'}

function seed(client: QueryClient, count: number) {
	const items = Array.from({length: count}, (_, index) =>
		normalizeTask({id: index + 1, project_id: 1, title: `Routine ${index + 1}`, routine: ended} as Task))
	client.setQueryData<PaginatedTaskResponse>(listKey, {items, total: count, page: 1, per_page: count, total_pages: 1})
	// An observer makes the list an active query, like an open project view.
	new QueryObserver(client, {queryKey: listKey, queryFn: () => client.getQueryData(listKey), staleTime: Infinity}).subscribe(() => {})
}

function mountRefresher(client: QueryClient) {
	return mount(defineComponent({
		setup() {
			useRoutineDayRefresh()
			return () => h('div')
		},
	}), {global: {plugins: [[VueQueryPlugin, {queryClient: client}]]}})
}

describe('routine day refresh', () => {
	let client: QueryClient

	beforeEach(() => {
		vi.clearAllMocks()
		clock.now = ref(new Date())
		client = new QueryClient({defaultOptions: {queries: {retry: false}}})
	})

	it('reads every routine whose day ended, batch after batch, instead of only the first batch', async () => {
		sdk.taskRoutineRead.mockImplementation(async () => ({
			data: {...ended, date: '2999-01-01', completed_today: false, completed_at: '', next_reset_at: '2999-01-02T00:00:00Z'},
		}))
		seed(client, 120)
		mountRefresher(client)

		clock.now.value = new Date()
		await vi.waitFor(() => expect(sdk.taskRoutineRead).toHaveBeenCalledTimes(120))
		const ids = sdk.taskRoutineRead.mock.calls.map(([options]) => options.path.task)
		expect(new Set(ids).size).toBe(120)
		await vi.waitFor(() => {
			const items = client.getQueryData<PaginatedTaskResponse>(listKey)!.items as (Task & {routine?: {date?: string}})[]
			expect(items.every(item => item.routine?.date === '2999-01-01')).toBe(true)
		})
	})

	it('does not ask again on every tick while the server still answers with the old day', async () => {
		sdk.taskRoutineRead.mockImplementation(async () => ({data: ended}))
		seed(client, 3)
		mountRefresher(client)

		clock.now.value = new Date()
		await vi.waitFor(() => expect(sdk.taskRoutineRead).toHaveBeenCalledTimes(3))
		clock.now.value = new Date()
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(sdk.taskRoutineRead).toHaveBeenCalledTimes(3)
	})
})
