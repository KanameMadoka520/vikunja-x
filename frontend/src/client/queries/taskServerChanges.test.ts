import {beforeEach, describe, expect, it, vi} from 'vitest'
import {QueryClient, QueryObserver} from '@tanstack/vue-query'

import {kanbanKeys, normalizeBucket, type BoardData} from './kanban'
import {projectKeys} from './projects'
import {TaskDeletedError} from './taskCache'
import {
	applyServerTaskChanges,
	applyServerTaskCreated,
	applyServerTaskDeleted,
	applyServerTaskUpdated,
	updateTaskMutationOptions,
} from './taskMutations'
import {normalizeTask, taskKeys, type PaginatedTaskResponse, type TaskResponse} from './tasks'
import {error} from '@/message'

const sdk = vi.hoisted(() => ({
	patchTasksRead: vi.fn(),
	projectViewBucketsTasksList: vi.fn(),
	projectViewTasksList: vi.fn(),
}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({error: vi.fn(), success: vi.fn(), translatedError: (key: string) => new Error(key)}))

const PROJECT = 1
const VIEW = 4
const board = kanbanKeys.board(PROJECT, VIEW)

function seed(client: QueryClient, key = board) {
	client.setQueryData(projectKeys.detail(PROJECT), {
		id: PROJECT,
		title: 'Website',
		views: [{id: VIEW, project_id: PROJECT, view_kind: 'kanban', default_bucket_id: 10, done_bucket_id: 30}],
	})
	const card = normalizeTask({id: 5, title: 'Landing page', project_id: PROJECT, done: false, updated: '2026-10-31T10:00:00Z'})
	client.setQueryData<BoardData>(key, {
		buckets: [
			normalizeBucket({id: 10, title: 'Backlog', count: 41, tasks: [card]}),
			normalizeBucket({id: 30, title: 'Done', count: 3, tasks: []}),
		],
		// Later pages of the backlog are loaded and must survive every server change.
		pages: {10: 2, 30: 1},
	})
	return card
}

// Observers keep queries active, so refetch counts show exactly what a receipt costs.
function observeList(client: QueryClient, queryFn: () => Promise<PaginatedTaskResponse>, project: number | null = PROJECT) {
	const observer = new QueryObserver(client, {queryKey: taskKeys.list({project}), queryFn, staleTime: Infinity})
	return observer.subscribe(() => {})
}

// An open board. Its own query function loads only the first page per bucket and must never run.
function observeBoard(client: QueryClient, key = board) {
	const firstPageOnly = vi.fn(async () => client.getQueryData<BoardData>(key)!)
	const stop = new QueryObserver(client, {queryKey: key, queryFn: firstPageOnly, staleTime: Infinity}).subscribe(() => {})
	return {firstPageOnly, stop}
}

// The server's board: the first page of every bucket, then the page 2 the backlog had loaded.
function serverBoard(backlog: TaskResponse[], count: number, backlogPage2: TaskResponse[] = []) {
	sdk.projectViewBucketsTasksList.mockResolvedValue({data: {items: [
		{id: 10, title: 'Backlog', count, tasks: backlog},
		{id: 30, title: 'Done', count: 3, tasks: []},
	]}})
	sdk.projectViewTasksList.mockResolvedValue({data: {items: backlogPage2}})
}

const page = (items: TaskResponse[]): PaginatedTaskResponse => ({items, total: items.length, page: 1, per_page: 50, total_pages: 1})

describe('server task changes (Arona receipts)', () => {
	beforeEach(() => vi.resetAllMocks())

	it('puts a created task on the open board once and refetches the open list once', async () => {
		const client = new QueryClient()
		seed(client)
		const listFn = vi.fn(async () => page([]))
		const stop = observeList(client, listFn)
		await vi.waitFor(() => expect(listFn).toHaveBeenCalledTimes(1))

		const created = {id: 6, title: 'Write FAQ', project_id: PROJECT, bucket_id: 0, updated: '2026-10-31T11:00:00Z'}
		await applyServerTaskCreated(client, created)
		await applyServerTaskCreated(client, created)

		const data = client.getQueryData<BoardData>(board)!
		expect(data.buckets[0].tasks.map(task => task.id)).toEqual([6, 5])
		expect(data.buckets[0].count).toBe(42)
		expect(data.pages).toEqual({10: 2, 30: 1})
		expect(listFn).toHaveBeenCalledTimes(3)
		expect(client.getQueryState(board)?.isInvalidated).toBe(true)
		expect(client.getQueryState(board)?.fetchStatus).toBe('idle')
		stop()
	})

	it('moves a task completed elsewhere into the done bucket without reloading the board', async () => {
		const client = new QueryClient()
		const card = seed(client)
		const applied = await applyServerTaskUpdated(client, {...card, done: true, updated: '2026-10-31T11:00:00Z'})

		expect(applied).toBe(true)
		const data = client.getQueryData<BoardData>(board)!
		expect(data.buckets[0].tasks).toEqual([])
		expect(data.buckets[1].tasks.map(task => [task.id, task.done])).toEqual([[5, true]])
		expect(data.buckets.map(bucket => bucket.count)).toEqual([40, 4])
		expect(data.pages).toEqual({10: 2, 30: 1})
	})

	it('ignores a late receipt when a newer copy of the task is cached', async () => {
		const client = new QueryClient()
		const card = seed(client)
		client.setQueryData(taskKeys.detail(5), {...card, title: 'Landing page v2', updated: '2026-10-31T12:00:00Z'})

		const applied = await applyServerTaskUpdated(client, {...card, title: 'Old title from a slow receipt', updated: '2026-10-31T11:00:00Z'})

		expect(applied).toBe(false)
		expect(client.getQueryData<TaskResponse>(taskKeys.detail(5))?.title).toBe('Landing page v2')
		expect(client.getQueryData<BoardData>(board)!.buckets[0].tasks[0].title).toBe('Landing page')
	})

	it('closes an open detail of a task deleted elsewhere instead of leaving it editable', async () => {
		const client = new QueryClient()
		const card = seed(client)
		const detail = new QueryObserver(client, {
			queryKey: taskKeys.detail(5),
			queryFn: async () => card,
			staleTime: Infinity,
			initialData: card,
		})
		const results: {data?: TaskResponse, error: unknown}[] = []
		const stop = detail.subscribe(result => results.push({data: result.data, error: result.error}))

		await applyServerTaskDeleted(client, 5)

		const last = results.at(-1)!
		expect(last.data).toBeUndefined()
		expect(last.error).toBeInstanceOf(TaskDeletedError)
		expect((last.error as TaskDeletedError).status).toBe(404)
		const data = client.getQueryData<BoardData>(board)!
		expect(data.buckets[0].tasks).toEqual([])
		expect(data.buckets[0].count).toBe(40)
		stop()
	})

	it('never lets a slower PATCH answer undo a newer receipt', async () => {
		const client = new QueryClient()
		const card = seed(client)
		let answer!: (value: unknown) => void
		sdk.patchTasksRead.mockImplementation(() => new Promise(resolve => {answer = resolve}))
		const saving = client.getMutationCache().build(client, updateTaskMutationOptions()).execute({id: 5, priority: 3})
		await vi.waitFor(() => expect(sdk.patchTasksRead).toHaveBeenCalledTimes(1))

		await applyServerTaskUpdated(client, {...card, title: 'Renamed by Arona', priority: 3, updated: '2026-10-31T12:00:00Z'})
		answer({data: {...card, priority: 3, updated: '2026-10-31T11:00:00Z'}})
		await saving

		expect(client.getQueryData<BoardData>(board)!.buckets[0].tasks[0]).toMatchObject({title: 'Renamed by Arona', priority: 3})
	})

	it('applies a PATCH answer with whole seconds over a loaded copy with a finer timestamp', async () => {
		const client = new QueryClient()
		// Loaded copies can carry milliseconds; the save answer of the same second does not.
		const card = normalizeTask({...seed(client), updated: '2026-10-31T10:00:00.900Z'})
		client.setQueryData<BoardData>(board, current => ({...current!, buckets: current!.buckets.map(bucket =>
			bucket.id === 10 ? {...bucket, tasks: [card]} : bucket)}))
		sdk.patchTasksRead.mockResolvedValue({data: {...card, project_id: 2, updated: '2026-10-31T10:00:00Z'}})

		// The sidebar drop: the task moves to another project and leaves this project's board.
		await client.getMutationCache().build(client, updateTaskMutationOptions()).execute({...card, id: 5, project_id: 2})

		expect(client.getQueryData<BoardData>(board)!.buckets[0].tasks).toEqual([])
		expect(client.getQueryData<BoardData>(board)!.buckets[0].count).toBe(40)
	})

	it('lets a later save win over a receipt applied before it started, but not over one that arrived during it', async () => {
		const client = new QueryClient()
		const card = seed(client)
		// (b) A receipt with a finer timestamp, applied before the save starts, in the save's own second.
		await applyServerTaskUpdated(client, {...card, title: 'Renamed by Arona', updated: '2026-10-31T11:00:00.700Z'})
		sdk.patchTasksRead.mockResolvedValueOnce({data: {...card, title: 'Renamed by Arona', priority: 4, updated: '2026-10-31T11:00:00Z'}})
		await client.getMutationCache().build(client, updateTaskMutationOptions()).execute({id: 5, priority: 4})
		expect(client.getQueryData<BoardData>(board)!.buckets[0].tasks[0].priority).toBe(4)

		// (a) The same timestamps, but the receipt arrives while the save is in flight: the receipt stays.
		let answer!: (value: unknown) => void
		sdk.patchTasksRead.mockImplementationOnce(() => new Promise(resolve => {answer = resolve}))
		const saving = client.getMutationCache().build(client, updateTaskMutationOptions()).execute({id: 5, priority: 1})
		await vi.waitFor(() => expect(sdk.patchTasksRead).toHaveBeenCalledTimes(2))
		await applyServerTaskUpdated(client, {...card, title: 'Renamed again', priority: 2, updated: '2026-10-31T11:00:01.700Z'})
		answer({data: {...card, priority: 1, updated: '2026-10-31T11:00:01Z'}})
		await saving
		expect(client.getQueryData<BoardData>(board)!.buckets[0].tasks[0]).toMatchObject({title: 'Renamed again', priority: 2})
	})

	it('refetches only open lists that can contain the task', async () => {
		const client = new QueryClient()
		const card = seed(client)
		const own = vi.fn(async () => page([]))
		const unrelated = vi.fn(async () => page([]))
		const everywhere = vi.fn(async () => page([]))
		const stops = [observeList(client, own), observeList(client, unrelated, 2), observeList(client, everywhere, null)]
		await vi.waitFor(() => expect(everywhere).toHaveBeenCalledTimes(1))

		await applyServerTaskUpdated(client, {...card, title: 'Landing page v2', updated: '2026-10-31T11:00:00Z'})

		expect(own).toHaveBeenCalledTimes(2)
		expect(everywhere).toHaveBeenCalledTimes(2)
		expect(unrelated).toHaveBeenCalledTimes(1)
		stops.forEach(stop => stop())
	})

	it('reconciles the board and both projects\' lists when a task moves to another project', async () => {
		const client = new QueryClient()
		const card = seed(client)
		const {firstPageOnly, stop} = observeBoard(client)
		const destination = vi.fn(async () => page([]))
		const stopList = observeList(client, destination, 2)
		await vi.waitFor(() => expect(destination).toHaveBeenCalledTimes(1))
		serverBoard([], 40, [normalizeTask({id: 9, title: 'From page 2', project_id: PROJECT})])

		await applyServerTaskUpdated(client, {...card, project_id: 2, updated: '2026-10-31T11:00:00Z'})

		expect(destination).toHaveBeenCalledTimes(2)
		expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1)
		expect(sdk.projectViewTasksList).toHaveBeenCalledTimes(1)
		const data = client.getQueryData<BoardData>(board)!
		expect(data.buckets[0].tasks.map(task => task.id)).toEqual([9])
		expect(data.pages).toEqual({10: 2, 30: 1})
		expect(firstPageOnly).not.toHaveBeenCalled()
		stop()
		stopList()
	})

	it('drops a card that a rename takes out of a searched board', async () => {
		const client = new QueryClient()
		const searched = kanbanKeys.board(PROJECT, VIEW, {q: 'Landing'})
		const card = seed(client, searched)
		const {firstPageOnly, stop} = observeBoard(client, searched)
		serverBoard([], 0)

		await applyServerTaskUpdated(client, {...card, title: 'Pricing page', updated: '2026-10-31T11:00:00Z'})

		expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1)
		expect(sdk.projectViewBucketsTasksList.mock.calls[0][0].query).toMatchObject({q: 'Landing'})
		expect(client.getQueryData<BoardData>(searched)!.buckets[0].tasks).toEqual([])
		expect(firstPageOnly).not.toHaveBeenCalled()
		stop()
	})

	it('reconciles an open board once for a whole batch and only patches a plain rename', async () => {
		const client = new QueryClient()
		const card = seed(client)
		const {stop} = observeBoard(client)
		serverBoard([normalizeTask({id: 6, title: 'Write FAQ', project_id: PROJECT}), card], 42)

		await applyServerTaskChanges(client, [
			{kind: 'created', task: {id: 6, title: 'Write FAQ', project_id: PROJECT, updated: '2026-10-31T11:00:00Z'}},
			{kind: 'created', task: {id: 7, title: 'Write docs', project_id: PROJECT, updated: '2026-10-31T11:00:00Z'}},
			{kind: 'updated', task: {...card, title: 'Landing page v2', updated: '2026-10-31T11:00:00Z'}},
		])
		expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1)
		expect(sdk.projectViewTasksList).toHaveBeenCalledTimes(1)

		vi.clearAllMocks()
		await applyServerTaskUpdated(client, {...card, title: 'Landing page v3', updated: '2026-10-31T12:00:00Z'})
		expect(sdk.projectViewBucketsTasksList).not.toHaveBeenCalled()
		expect(client.getQueryData<BoardData>(board)!.buckets[0].tasks.find(task => task.id === 5)?.title).toBe('Landing page v3')
		stop()
	})

	it('keeps the patched board and marks it stale when its reconciliation fails', async () => {
		const client = new QueryClient()
		seed(client)
		const {firstPageOnly, stop} = observeBoard(client)
		sdk.projectViewBucketsTasksList.mockRejectedValue(new Error('Network down'))

		await expect(applyServerTaskCreated(client, {id: 6, title: 'Write FAQ', project_id: PROJECT, bucket_id: 0}))
			.resolves.toBeUndefined()

		const data = client.getQueryData<BoardData>(board)!
		expect(data.buckets[0].tasks.map(task => task.id)).toEqual([6, 5])
		expect(data.pages).toEqual({10: 2, 30: 1})
		expect(client.getQueryState(board)).toMatchObject({isInvalidated: true, fetchStatus: 'idle'})
		expect(firstPageOnly).not.toHaveBeenCalled()
		// The write itself succeeded: the message says only that the board may be out of date.
		expect(error).toHaveBeenCalledTimes(1)
		expect(vi.mocked(error).mock.calls[0][0]).toEqual(new Error('project.kanban.refreshFailed'))
		stop()
	})
})
