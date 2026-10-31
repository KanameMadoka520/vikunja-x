import {describe, expect, it, vi} from 'vitest'
import {QueryClient, QueryObserver} from '@tanstack/vue-query'

import {kanbanKeys, normalizeBucket, type BoardData} from './kanban'
import {projectKeys} from './projects'
import {cachedTaskCopies, TaskDeletedError} from './taskCache'
import {applyServerTaskChanges} from './taskMutations'
import {normalizeTask, taskKeys, type PaginatedTaskResponse, type TaskResponse} from './tasks'

vi.mock('@/client/generated', () => ({}))
vi.mock('@/message', () => ({
	error: vi.fn(),
	success: vi.fn(),
}))

const PROJECT = 1
const VIEW = 4
const board = kanbanKeys.board(PROJECT, VIEW)
const listKey = taskKeys.list({project: PROJECT})

function seed(client: QueryClient) {
	client.setQueryData(projectKeys.detail(PROJECT), {
		id: PROJECT,
		title: 'Website',
		views: [{id: VIEW, project_id: PROJECT, view_kind: 'kanban', default_bucket_id: 10, done_bucket_id: 30}],
	})
	const landing = normalizeTask({id: 5, title: 'Landing page', project_id: PROJECT, updated: '2026-10-31T10:00:00Z'})
	const faq = normalizeTask({id: 7, title: 'FAQ', project_id: PROJECT, updated: '2026-10-31T10:00:00Z'})
	client.setQueryData<BoardData>(board, {
		buckets: [
			normalizeBucket({id: 10, title: 'Backlog', count: 41, tasks: [landing, faq]}),
			normalizeBucket({id: 30, title: 'Done', count: 3, tasks: []}),
		],
		pages: {10: 2, 30: 1},
	})
	return {landing, faq}
}

const page = (items: TaskResponse[]): PaginatedTaskResponse => ({items, total: items.length, page: 1, per_page: 50, total_pages: 1})

describe('applyServerTaskChanges', () => {
	it('applies a batch in order and refetches the open list once, never the board', async () => {
		const client = new QueryClient()
		const {landing, faq} = seed(client)
		const listFn = vi.fn(async () => page([]))
		const stop = new QueryObserver(client, {queryKey: listKey, queryFn: listFn, staleTime: Infinity}).subscribe(() => {})
		const detail = new QueryObserver(client, {
			queryKey: taskKeys.detail(7),
			queryFn: async () => faq,
			staleTime: Infinity,
			initialData: faq,
		})
		const errors: unknown[] = []
		const stopDetail = detail.subscribe(result => errors.push(result.error))
		await vi.waitFor(() => expect(listFn).toHaveBeenCalledTimes(1))

		const created = {id: 6, title: 'Write FAQ', project_id: PROJECT, updated: '2026-10-31T11:00:00Z'}
		await applyServerTaskChanges(client, [
			{kind: 'created', task: created},
			{kind: 'created', task: created},
			{kind: 'updated', task: {...landing, done: true, updated: '2026-10-31T11:00:00Z'}},
			{kind: 'deleted', id: 7},
		])

		const data = client.getQueryData<BoardData>(board)!
		expect(data.buckets[0].tasks.map(task => task.id)).toEqual([6])
		expect(data.buckets[1].tasks.map(task => [task.id, task.done])).toEqual([[5, true]])
		expect(data.buckets.map(bucket => bucket.count)).toEqual([40, 4])
		expect(data.pages).toEqual({10: 2, 30: 1})
		expect(errors.at(-1)).toBeInstanceOf(TaskDeletedError)
		expect(listFn).toHaveBeenCalledTimes(2)
		expect(client.getQueryState(board)?.fetchStatus).toBe('idle')
		stop()
		stopDetail()
	})

	it('skips an update older than the cached copy', async () => {
		const client = new QueryClient()
		const {landing} = seed(client)
		await applyServerTaskChanges(client, [
			{kind: 'updated', task: {...landing, title: 'From a slow receipt', updated: '2026-10-31T09:00:00Z'}},
		])
		expect(client.getQueryData<BoardData>(board)!.buckets[0].tasks[0].title).toBe('Landing page')
	})

	it('does nothing for an empty batch', async () => {
		const client = new QueryClient()
		seed(client)
		await applyServerTaskChanges(client, [])
		expect(client.getQueryState(board)?.isInvalidated).toBe(false)
	})
})

describe('cachedTaskCopies', () => {
	it('reads every cached copy, including nested relations, without writing', () => {
		const client = new QueryClient()
		const {landing} = seed(client)
		client.setQueryData(taskKeys.detail(9), normalizeTask({id: 9, project_id: PROJECT, related_tasks: {related: [landing]}}))
		client.setQueryData(listKey, page([landing]))
		const updates = () => client.getQueryCache().getAll().map(query => query.state.dataUpdateCount)
		const before = updates()

		expect(cachedTaskCopies(client, 5).map(task => task.title)).toEqual(['Landing page', 'Landing page', 'Landing page'])
		expect(cachedTaskCopies(client, 404)).toEqual([])
		expect(updates()).toEqual(before)
	})
})
