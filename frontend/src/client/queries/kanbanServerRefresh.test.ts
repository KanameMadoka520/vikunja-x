import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {QueryClient, QueryObserver, type QueryKey} from '@tanstack/vue-query'
import {agentBoardKeys, refreshAgentBoards} from './kanbanServerRefresh'
import {kanbanKeys, normalizeBucket, type BoardData} from './kanban'
import {normalizeTask} from './tasks'

const sdk = vi.hoisted(() => ({projectViewBucketsTasksList: vi.fn(), projectViewTasksList: vi.fn()}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({error: vi.fn(), success: vi.fn()}))

const clients: QueryClient[] = []
const stops: (() => void)[] = []
const tasks = (from: number, count: number, project = 1) => Array.from({length: count}, (_, i) =>
	normalizeTask({id: from + i, project_id: project, title: `Task ${from + i}`, updated: '2026-10-31T11:00:00Z'}))
const board = (depth = 2, project = 1): BoardData => ({
	buckets: [normalizeBucket({id: 10, count: 80, tasks: tasks(1, depth * 25, project)})], pages: {10: depth},
})
function client() {
	const value = new QueryClient({defaultOptions: {queries: {retry: false}}})
	clients.push(value)
	return value
}
function observe(value: QueryClient, key: QueryKey, data = board()) {
	value.setQueryData(key, data)
	const observer = new QueryObserver(value, {queryKey: key, queryFn: async () => data, staleTime: Infinity})
	const stop = observer.subscribe(() => {})
	stops.push(stop)
	return stop
}
function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (cause: unknown) => void
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
	return {promise, resolve, reject}
}
function firstPage() {
	return {data: {items: [{id: 10, count: 80, tasks: tasks(1, 25)}]}}
}

beforeEach(() => {
	vi.resetAllMocks()
	window.API_URL = ''
	sdk.projectViewBucketsTasksList.mockResolvedValue(firstPage())
	sdk.projectViewTasksList.mockImplementation(async ({query}) => ({data: {items: tasks((query.page - 1) * 25 + 1, 25)}}))
})
afterEach(() => {
	stops.splice(0).forEach(stop => stop())
	clients.splice(0).forEach(value => value.clear())
	window.API_URL = ''
})

describe('agent changes on open filtered/paginated boards', () => {
	it('captures affected active source/destination and pseudo boards, leaving unrelated or inactive boards alone', () => {
		const value = client()
		const source = kanbanKeys.board(1, 4)
		const destination = kanbanKeys.board(2, 8)
		const unrelated = kanbanKeys.board(3, 12)
		const favorite = kanbanKeys.board(-1, 1)
		const inactive = kanbanKeys.board(2, 9)
		observe(value, source)
		observe(value, destination, board(1, 2))
		observe(value, unrelated, {buckets: [normalizeBucket({id: 20, tasks: tasks(100, 1, 3)})], pages: {20: 1}})
		observe(value, favorite)
		value.setQueryData(inactive, board())
		expect(agentBoardKeys(value, {projectIds: [2], taskIds: [5]})).toEqual([source, destination, favorite])
		expect(agentBoardKeys(value, {projectIds: []})).toEqual([])
	})

	it('preserves the loaded second page and filter/sort parameters without publishing a first-page-only board', async () => {
		const value = client()
		const key = kanbanKeys.board(1, 4, {filter: 'priority >= 3', q: 'landing'})
		observe(value, key)
		const pending = deferred<{data: {items: ReturnType<typeof tasks>}}>()
		sdk.projectViewTasksList.mockReturnValueOnce(pending.promise)
		const refreshing = refreshAgentBoards(value, [key])
		await vi.waitFor(() => expect(sdk.projectViewTasksList).toHaveBeenCalledTimes(1))
		expect(value.getQueryData<BoardData>(key)?.buckets[0].tasks).toHaveLength(50)
		expect(sdk.projectViewTasksList).toHaveBeenCalledWith(expect.objectContaining({
			path: {project: 1, view: 4},
			query: expect.objectContaining({page: 2, per_page: 25, q: 'landing', filter: '(priority >= 3) && bucket_id = 10', sort_by: ['position'], order_by: ['asc']}),
		}))
		pending.resolve({data: {items: tasks(26, 25)}})
		await refreshing
		expect(value.getQueryData<BoardData>(key)?.pages).toEqual({10: 2})
		expect(value.getQueryData<BoardData>(key)?.buckets[0].tasks.map(task => task.id)).toEqual(tasks(1, 50).map(task => task.id))
	})

	it('uses actual server membership and removes stale cards while keeping the loaded window', async () => {
		const value = client()
		const key = kanbanKeys.board(1, 4, {filter: 'done = false'})
		observe(value, key)
		sdk.projectViewBucketsTasksList.mockResolvedValueOnce({data: {items: [{id: 10, count: 50, tasks: tasks(2, 25)}]}})
		sdk.projectViewTasksList.mockResolvedValueOnce({data: {items: tasks(27, 25)}})
		await refreshAgentBoards(value, [key])
		const data = value.getQueryData<BoardData>(key)!
		expect(data.buckets[0].tasks.map(task => task.id)).toEqual(tasks(2, 50).map(task => task.id))
		expect(data.pages[10]).toBe(2)
		expect(data.buckets[0].count).toBe(50)
	})

	it('retries against newly loaded depth instead of discarding a page loaded during the request', async () => {
		const value = client()
		const key = kanbanKeys.board(1, 4)
		observe(value, key)
		const pending = deferred<ReturnType<typeof firstPage>>()
		sdk.projectViewBucketsTasksList.mockReturnValueOnce(pending.promise)
		const refreshing = refreshAgentBoards(value, [key])
		await vi.waitFor(() => expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1))
		value.setQueryData(key, board(3))
		pending.resolve(firstPage())
		await refreshing
		expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(2)
		expect(value.getQueryData<BoardData>(key)?.pages[10]).toBe(3)
		expect(value.getQueryData<BoardData>(key)?.buckets[0].tasks).toHaveLength(75)
	})

	it('coalesces overlapping receipts and discards the first response if a newer receipt arrived', async () => {
		const value = client()
		const key = kanbanKeys.board(1, 4)
		observe(value, key)
		const pending = deferred<ReturnType<typeof firstPage>>()
		sdk.projectViewBucketsTasksList.mockReturnValueOnce(pending.promise)
		const first = refreshAgentBoards(value, [key, key])
		await vi.waitFor(() => expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1))
		const second = refreshAgentBoards(value, [key])
		expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1)
		pending.resolve(firstPage())
		await Promise.all([first, second])
		expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(2)
	})

	it('retains the entire current board if a later page fails', async () => {
		const value = client()
		const key = kanbanKeys.board(1, 4)
		observe(value, key)
		const previous = value.getQueryData(key)
		sdk.projectViewTasksList.mockRejectedValueOnce(new Error('offline'))
		await expect(refreshAgentBoards(value, [key])).rejects.toThrow('offline')
		expect(value.getQueryData(key)).toBe(previous)
	})

	it('rejects data from the previous API identity and never commits it to the cache', async () => {
		const value = client()
		const key = kanbanKeys.board(1, 4)
		observe(value, key)
		const previous = value.getQueryData(key)
		const pending = deferred<ReturnType<typeof firstPage>>()
		sdk.projectViewBucketsTasksList.mockReturnValueOnce(pending.promise)
		const refreshing = refreshAgentBoards(value, [key])
		const rejection = expect(refreshing).rejects.toMatchObject({name: 'AbortError'})
		await vi.waitFor(() => expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1))
		window.API_URL = 'https://another.example/api/v2'
		pending.resolve(firstPage())
		await rejection
		expect(sdk.projectViewTasksList).not.toHaveBeenCalled()
		expect(value.getQueryData(key)).toBe(previous)
	})

	it('stops observation without writing after the board is left', async () => {
		const value = client()
		const key = kanbanKeys.board(1, 4)
		const stop = observe(value, key)
		const previous = value.getQueryData(key)
		const pending = deferred<ReturnType<typeof firstPage>>()
		sdk.projectViewBucketsTasksList.mockReturnValueOnce(pending.promise)
		const refreshing = refreshAgentBoards(value, [key])
		await vi.waitFor(() => expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1))
		stop()
		pending.resolve(firstPage())
		await refreshing
		expect(value.getQueryData(key)).toBe(previous)
		expect(sdk.projectViewBucketsTasksList.mock.calls[0][0].signal.aborted).toBe(true)
	})
})
