import {beforeEach, describe, expect, it, vi} from 'vitest'
import {QueryClient} from '@tanstack/vue-query'
import {createTaskRelationMutationOptions, deleteTaskRelationMutationOptions} from './taskMutations'
import {kanbanKeys, normalizeBucket, type BoardData} from './kanban'
import {normalizeTask} from './tasks'
const sdk = vi.hoisted(() => ({tasksRead: vi.fn(), tasksRelationsCreate: vi.fn(), tasksRelationsDelete: vi.fn()}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({error: vi.fn(), success: vi.fn()}))
vi.mock('@/client/requestContext', () => ({captureClientRequestContext: () => 1, assertClientRequestContext: vi.fn(), isClientRequestContextCurrent: () => true, isRequestContextAbort: () => false}))
beforeEach(() => {vi.clearAllMocks()})
describe('relation mutations on a scrolled board', () => {
	it('refreshes both ends after creating and removing a relation without resetting loaded pages', async () => {
		const client = new QueryClient()
		const key = kanbanKeys.board(1, 4)
		client.setQueryData<BoardData>(key, {buckets: [normalizeBucket({id: 1, count: 50, tasks: [{id: 1, title: 'Keep local title'}, {id: 2}]})], pages: {1: 3}})
		let related = true
		sdk.tasksRelationsCreate.mockResolvedValue({data: {}})
		sdk.tasksRelationsDelete.mockResolvedValue({data: undefined})
		sdk.tasksRead.mockImplementation(async ({path}: {path: {task: number}}) => ({data: normalizeTask({id: path.task, title: 'Old title', related_tasks: related ? path.task === 1 ? {subtask: [{id: 2}]} : {parenttask: [{id: 1}]} : {}})}))
		await client.getMutationCache().build(client, createTaskRelationMutationOptions()).execute({taskId: 1, other_task_id: 2, relation_kind: 'subtask'})
		let board = client.getQueryData<BoardData>(key)!
		expect(board.buckets[0].tasks[0].related_tasks.subtask).toHaveLength(1)
		expect(board.buckets[0].tasks[1].related_tasks.parenttask).toHaveLength(1)
		expect(board.buckets[0].tasks[0].title).toBe('Keep local title')
		expect(board.pages).toEqual({1: 3})
		expect(board.buckets[0].count).toBe(50)
		related = false
		await client.getMutationCache().build(client, deleteTaskRelationMutationOptions()).execute({task: 1, otherTask: 2, relationKind: 'subtask'})
		board = client.getQueryData<BoardData>(key)!
		expect(board.buckets[0].tasks.every(task => Object.keys(task.related_tasks).length === 0)).toBe(true)
		expect(board.pages).toEqual({1: 3})
	})
})
