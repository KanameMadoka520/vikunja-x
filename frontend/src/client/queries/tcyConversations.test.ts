import {beforeEach, describe, expect, it, vi} from 'vitest'
import {QueryClient, QueryObserver, type QueryKey} from '@tanstack/vue-query'
import type {Action, ChatTurn, Conversation, Label, Task} from '@/client/generated'
import {removeToken} from '@/helpers/auth'
import {
	agentReceipt,
	agentRefreshMutationOptions,
	agentRunScope,
	planAgentRefresh,
	takeAgentReceipts,
	trackNewConversation,
	type AgentReceipt,
} from './tcyConversations'
import {normalizeTask, taskKeys, type PaginatedTaskResponse, type TaskResponse} from './tasks'
import {kanbanKeys, normalizeBucket, type BoardData} from './kanban'
import {labelKeys} from './labels'
import {commentKeys} from './comments'
import {normalizeProject, projectKeys, type ProjectListResult, type ProjectResponse} from './projects'
import {projectTimelineKeys} from './projectTimeline'
import {mapTaskEverywhere, TaskDeletedError} from './taskCache'

const sdk = vi.hoisted(() => ({
	tasksRead: vi.fn(),
	// Board reconciliation: the first page of every bucket, then each further loaded page.
	projectViewBucketsTasksList: vi.fn(),
	projectViewTasksList: vi.fn(),
}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({
	error: vi.fn(),
	success: vi.fn(),
}))

function action(tool: string, args: object, result: unknown, success = true): Action {
	return {
		tool,
		arguments: JSON.stringify(args),
		result: typeof result === 'string' ? result : JSON.stringify(result),
		success,
	}
}

function conversation(id: string, turns: {id: string, actions: Action[]}[]): Conversation {
	return {
		id,
		turns: turns.map((turn): ChatTurn => ({
			id: turn.id,
			status: 'completed',
			result: {actions: turn.actions},
		})),
	}
}

function receipt(tool: string, args: object, result: unknown): AgentReceipt {
	return agentReceipt(`turn:${tool}`, action(tool, args, result))!
}

const serverTask = {
	id: 3,
	project_id: 1,
	title: 'Renamed by Arona',
	done: false,
	labels: null,
	assignees: null,
}

describe('agent receipts', () => {
	it('records an opened chat without replaying it and applies each later receipt once', () => {
		const client = new QueryClient()
		const old = conversation('old', [{id: 't1', actions: [action('update_task', {id: 3, title: 'x'}, serverTask)]}])
		expect(takeAgentReceipts(client, old)).toEqual([])
		expect(takeAgentReceipts(client, old)).toEqual([])

		const live = conversation('old', [{
			id: 't1',
			actions: [
				action('update_task', {id: 3, title: 'x'}, serverTask),
				action('list_project_timeline', {year: 2026}, {items: []}),
				action('update_task', {id: 4, title: 'y'}, {success: false}, false),
				action('add_task_label', {id: 3, label_id: 9}, {label_id: 9}),
			],
		}])
		expect(takeAgentReceipts(client, live).map(item => [item.key, item.tool])).toEqual([['t1:3', 'add_task_label']])
		expect(takeAgentReceipts(client, live)).toEqual([])
	})

	it('switching back to an earlier chat replays nothing', () => {
		const client = new QueryClient()
		const first = conversation('a', [{id: 't1', actions: [action('delete_task', {id: 1}, {success: true})]}])
		const second = conversation('b', [{id: 't2', actions: [action('create_task', {project_id: 1, title: 'n'}, {id: 5})]}])
		takeAgentReceipts(client, first)
		takeAgentReceipts(client, second)
		expect(takeAgentReceipts(client, first)).toEqual([])
		expect(takeAgentReceipts(client, second)).toEqual([])
	})

	it('applies the first receipts of a chat created in this tab', () => {
		const client = new QueryClient()
		trackNewConversation(client, 'fresh')
		const fresh = conversation('fresh', [{id: 't1', actions: [action('create_task', {project_id: 1, title: 'n'}, {id: 5})]}])
		expect(takeAgentReceipts(client, fresh).map(item => item.tool)).toEqual(['create_task'])
	})

	it('keeps ledgers per query client', () => {
		const chat = conversation('shared', [{id: 't1', actions: []}])
		const first = new QueryClient()
		const second = new QueryClient()
		takeAgentReceipts(first, chat)
		const next = conversation('shared', [{id: 't1', actions: [action('delete_task', {id: 1}, {success: true})]}])
		expect(takeAgentReceipts(second, next)).toEqual([])
		expect(takeAgentReceipts(first, next)).toHaveLength(1)
	})

	it('starts a fresh ledger for the next account on the same query client', () => {
		const client = new QueryClient()
		const created = conversation('created', [{id: 't1', actions: [action('delete_task', {id: 1}, {success: true})]}])
		const observed = conversation('observed', [{id: 't1', actions: [action('delete_task', {id: 2}, {success: true})]}])
		trackNewConversation(client, 'created')
		takeAgentReceipts(client, observed)
		agentRunScope(client).live.value = 'observed'

		// Logging out keeps the query client alive.
		removeToken()

		expect(agentRunScope(client).live.value).toBe('')
		// Not inherited: the previous account's fresh chat replays nothing for the next one.
		expect(takeAgentReceipts(client, created)).toEqual([])
		// Not suppressed: what the previous account recorded does not hide a new chat's receipts.
		trackNewConversation(client, 'observed')
		expect(takeAgentReceipts(client, observed).map(item => item.key)).toEqual(['t1:0'])
	})

	it('applies a running chat\'s new action once across conversation refetches', () => {
		const client = new QueryClient()
		trackNewConversation(client, 'live')
		const first = conversation('live', [{id: 't1', actions: [action('create_task', {project_id: 1}, {id: 5, project_id: 1})]}])
		// A refetch returns a new object with the same turn and one more action.
		const refetched = conversation('live', [{
			id: 't1',
			actions: [
				action('create_task', {project_id: 1}, {id: 5, project_id: 1}),
				action('update_task', {id: 5, done: true}, {id: 5, project_id: 1, done: true}),
			],
		}])
		expect(takeAgentReceipts(client, first).map(item => item.key)).toEqual(['t1:0'])
		expect(takeAgentReceipts(client, structuredClone(first))).toEqual([])
		expect(takeAgentReceipts(client, refetched).map(item => item.key)).toEqual(['t1:1'])
		expect(takeAgentReceipts(client, refetched)).toEqual([])
	})
})

describe('receipt refresh plan', () => {
	it('turns returned tasks into server task changes and touches history only for projects', () => {
		const title = planAgentRefresh([receipt('update_task', {id: 3, title: 'x'}, serverTask)])
		expect(title.operations).toEqual([{kind: 'task', task: serverTask}])
		expect(title.taskLists).toBe(false)
		expect(title.timeline).toBe(false)
		expect(title.history).toBe(false)
		expect(planAgentRefresh([receipt('update_task', {id: 3, due_date: '2026-11-02T00:00:00Z'}, serverTask)]).timeline)
			.toBe(true)
	})

	it('maps create, update, bulk update and delete receipts to their task changes', () => {
		const created = {id: 5, project_id: 1, title: 'n'}
		const second = {...serverTask, id: 4}
		const plan = planAgentRefresh([
			receipt('create_task', {project_id: 1, title: 'n'}, created),
			receipt('update_task', {id: 3, done: true}, serverTask),
			receipt('bulk_update_tasks', {updates: [{id: 3, changes: {priority: 2}}, {id: 4, changes: {priority: 2}}]}, [serverTask, second]),
			receipt('delete_task', {id: 6}, {success: true, deleted: true}),
		])
		expect(plan.operations).toEqual([
			{kind: 'createdTask', task: created},
			{kind: 'task', task: serverTask},
			{kind: 'task', task: serverTask},
			{kind: 'task', task: second},
			{kind: 'removeTask', id: 6},
		])
		expect(plan.taskLists).toBe(false)
		expect(plan.timeline).toBe(true)
	})

	it('falls back to the named task and open lists when the receipt holds no task', () => {
		const plan = planAgentRefresh([receipt('update_task', {id: 1}, {})])
		expect(plan.operations).toEqual([])
		expect(plan.refetchTasks).toEqual([1])
		expect(plan.taskLists).toBe('active')
		expect(planAgentRefresh([receipt('create_task', {project_id: 1}, {success: true})]).taskLists).toBe('active')
	})

	it('reconciles a comment count with the server instead of adding one locally', () => {
		const plan = planAgentRefresh([receipt('add_comment', {id: 3, comment: 'Done'}, {id: 40, comment: 'Done'})])
		expect(plan.operations).toEqual([])
		expect(plan.comments).toEqual([3])
	})

	it('updates project history and timeline only for visible project changes', () => {
		const project = {id: 7, title: 'Thesis', is_completed: true}
		const completed = planAgentRefresh([receipt('set_project_completed', {id: 7, completed: true}, project)])
		expect(completed.operations).toEqual([{kind: 'project', project}])
		expect(completed).toMatchObject({history: true, timeline: true, projectList: true, taskLists: false})
		const described = planAgentRefresh([receipt('update_project', {id: 7, description: 'd'}, project)])
		expect(described).toMatchObject({history: false, timeline: false, projectList: true})
	})

	it('narrows unknown writes to the named records', () => {
		const plan = planAgentRefresh([receipt('archive_everything', {id: 4, project_id: 2}, {success: true})])
		expect(plan).toMatchObject({
			refetchTasks: [4],
			refetchProjects: [2],
			taskLists: 'none',
		})
	})

	it('ignores read-only and failed tools', () => {
		expect(agentReceipt('k', action('list_project_timeline', {year: 2026}, {}))).toBeUndefined()
		expect(agentReceipt('k', action('web_search', {query: 'q'}, {}))).toBeUndefined()
		expect(agentReceipt('k', action('update_task', {id: 1}, {}, false))).toBeUndefined()
	})
})

describe('receipt refresh cache writes', () => {
	let client: QueryClient
	const listKey = taskKeys.list({project: 1})
	const boardKey = kanbanKeys.board(1, 4)
	const listFetch = vi.fn()
	const boardFetch = vi.fn()
	const task = normalizeTask({id: 3, project_id: 1, title: 'Before', bucket_id: 8, position: 250})

	function observe(queryKey: QueryKey, queryFn: () => unknown) {
		return new QueryObserver(client, {queryKey, queryFn, staleTime: Infinity}).subscribe(() => {})
	}

	async function apply(receipts: AgentReceipt[]) {
		await client.getMutationCache().build(client, agentRefreshMutationOptions()).execute(planAgentRefresh(receipts))
	}

	beforeEach(() => {
		vi.clearAllMocks()
		client = new QueryClient({defaultOptions: {queries: {retry: false}}})
		listFetch.mockResolvedValue({items: [task], total: 1, page: 1, per_page: 50, total_pages: 1})
		boardFetch.mockResolvedValue({buckets: [], pages: {}})
		client.setQueryData<PaginatedTaskResponse>(listKey, {items: [task], total: 1, page: 1, per_page: 50, total_pages: 1})
		client.setQueryData<BoardData>(boardKey, {buckets: [normalizeBucket({id: 8, count: 30, tasks: [task]})], pages: {8: 2}})
		client.setQueryData<Label[]>(labelKeys.all, [{id: 9, title: 'Urgent'}])
		client.setQueryData(projectTimelineKeys.query({year: 2026}), {items: []})
		client.setQueryData(['project-history', {year: 2026}], {items: []})
		observe(listKey, listFetch)
		observe(boardKey, boardFetch)
	})

	// The open list refetches after a task change; the mocked server answers with its state after the receipt.
	function serverList(tasks: TaskResponse[]) {
		const patchedBeforeRefetch: string[] = []
		listFetch.mockImplementation(async () => {
			patchedBeforeRefetch.push(client.getQueryData<PaginatedTaskResponse>(listKey)!.items.map(item => item.title).join())
			return {items: tasks, total: tasks.length, page: 1, per_page: 50, total_pages: 1}
		})
		return patchedBeforeRefetch
	}

	it('patches the task in lists and boards, refetches the open list once and never the board', async () => {
		const seen = serverList([normalizeTask({...task, title: 'Renamed by Arona'})])
		await apply([receipt('update_task', {id: 3, title: 'x'}, serverTask)])
		expect(seen).toEqual(['Renamed by Arona'])
		const listed = client.getQueryData<PaginatedTaskResponse>(listKey)!.items[0]
		const card = client.getQueryData<BoardData>(boardKey)!.buckets[0]
		expect(listed.title).toBe('Renamed by Arona')
		expect(card.tasks[0]).toMatchObject({title: 'Renamed by Arona', bucket_id: 8, position: 250})
		expect(client.getQueryData<BoardData>(boardKey)!.pages).toEqual({8: 2})
		// The open list follows the server: the task may no longer match its filter.
		expect(listFetch).toHaveBeenCalledTimes(1)
		// A rename cannot change membership of an unfiltered board: the patch is the whole update.
		expect(boardFetch).not.toHaveBeenCalled()
		expect(sdk.projectViewBucketsTasksList).not.toHaveBeenCalled()
		expect(client.getQueryState(boardKey)?.isInvalidated).toBe(false)
		expect(sdk.tasksRead).not.toHaveBeenCalled()
		expect(client.getQueryState(labelKeys.all)?.isInvalidated).toBe(false)
		expect(client.getQueryState(['project-history', {year: 2026}])?.isInvalidated).toBe(false)
	})

	it('refetches open lists once for a whole bulk update', async () => {
		serverList([normalizeTask({...task, priority: 2})])
		await apply([receipt('bulk_update_tasks', {updates: [{id: 3, changes: {priority: 2}}]}, [
			{...serverTask, priority: 2},
			{...serverTask, id: 4, priority: 2},
		])])
		expect(client.getQueryData<BoardData>(boardKey)!.buckets[0].tasks[0].priority).toBe(2)
		expect(listFetch).toHaveBeenCalledTimes(1)
		expect(boardFetch).not.toHaveBeenCalled()
		expect(sdk.projectViewBucketsTasksList).not.toHaveBeenCalled()
	})

	it('ignores a late receipt when a newer copy of the task is cached', async () => {
		client.setQueryData(taskKeys.detail(3), {...task, title: 'Edited later', updated: '2026-10-31T12:00:00Z'})
		await apply([receipt('update_task', {id: 3, title: 'x'}, {...serverTask, updated: '2026-10-31T11:00:00Z'})])
		expect(client.getQueryData<TaskResponse>(taskKeys.detail(3))?.title).toBe('Edited later')
		expect(client.getQueryData<PaginatedTaskResponse>(listKey)!.items[0].title).toBe('Before')
	})

	it('marks the timeline stale when a schedule changes', async () => {
		await apply([receipt('update_task', {id: 3, end_date: '2026-11-04T00:00:00Z'}, serverTask)])
		expect(client.getQueryState(projectTimelineKeys.query({year: 2026}))?.isInvalidated).toBe(true)
		expect(client.getQueryState(['project-history', {year: 2026}])?.isInvalidated).toBe(false)
	})

	// The server's board after the receipt: 31 cards in bucket 8, the second page holding the oldest.
	function serverBoard(firstPage: TaskResponse[], count: number, secondPage: TaskResponse[] = []) {
		sdk.projectViewBucketsTasksList.mockResolvedValue({data: {items: [{id: 8, count, tasks: firstPage}]}})
		sdk.projectViewTasksList.mockResolvedValue({data: {items: secondPage}})
	}

	it('puts a created task on the open board once and reconciles its loaded pages once', async () => {
		client.setQueryData(projectKeys.detail(1), {
			id: 1,
			title: 'Website',
			views: [{id: 4, project_id: 1, view_kind: 'kanban', default_bucket_id: 8}],
		})
		const older = normalizeTask({id: 2, project_id: 1, title: 'Oldest', bucket_id: 8})
		serverBoard([normalizeTask({id: 5, project_id: 1, title: 'New', bucket_id: 8}), task], 31, [older])
		const created = receipt('create_task', {project_id: 1, title: 'New'}, {id: 5, project_id: 1, title: 'New'})
		await apply([created])
		// One request per loaded page: the bucket list, then page 2 of the bucket that had two loaded.
		expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1)
		expect(sdk.projectViewBucketsTasksList.mock.calls[0][0]).toMatchObject({path: {project: 1, view: 4}})
		expect(sdk.projectViewTasksList).toHaveBeenCalledTimes(1)
		expect(sdk.projectViewTasksList.mock.calls[0][0].query).toMatchObject({page: 2, filter: 'bucket_id = 8'})
		// The same receipt again (another window, a replayed plan) adds no second card.
		await apply([created])
		const bucket = client.getQueryData<BoardData>(boardKey)!.buckets[0]
		expect(bucket.tasks.map(item => item.id)).toEqual([5, 3, 2])
		expect(bucket.count).toBe(31)
		expect(client.getQueryData<BoardData>(boardKey)!.pages).toEqual({8: 2})
		// Never the generic first-page refetch, which would drop the second page.
		expect(boardFetch).not.toHaveBeenCalled()
	})

	it('moves a task completed by Arona into the done bucket', async () => {
		client.setQueryData(projectKeys.detail(1), {
			id: 1,
			title: 'Website',
			views: [{id: 4, project_id: 1, view_kind: 'kanban', default_bucket_id: 8, done_bucket_id: 9}],
		})
		client.setQueryData<BoardData>(boardKey, {
			buckets: [
				normalizeBucket({id: 8, count: 30, tasks: [task]}),
				normalizeBucket({id: 9, count: 2, tasks: []}),
			],
			pages: {8: 2, 9: 1},
		})
		await apply([receipt('update_task', {id: 3, done: true}, {...serverTask, done: true})])
		const buckets = client.getQueryData<BoardData>(boardKey)!.buckets
		expect(buckets[0].tasks).toEqual([])
		expect(buckets[1].tasks.map(item => [item.id, item.done])).toEqual([[3, true]])
		expect(buckets.map(item => item.count)).toEqual([29, 3])
		expect(client.getQueryData<BoardData>(boardKey)!.pages).toEqual({8: 2, 9: 1})
		// The done bucket move is local; an unfiltered board needs no request for it.
		expect(boardFetch).not.toHaveBeenCalled()
		expect(sdk.projectViewBucketsTasksList).not.toHaveBeenCalled()
	})

	it('refetches mounted lists for a created task and reconciles the board, never its first page alone', async () => {
		serverBoard([task], 31)
		await apply([receipt('create_task', {project_id: 1, title: 'New'}, {id: 5, project_id: 1, title: 'New'})])
		expect(listFetch).toHaveBeenCalledTimes(1)
		expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1)
		expect(boardFetch).not.toHaveBeenCalled()
	})

	it('adds a cached label without a request and fetches the task for an unknown one', async () => {
		await apply([receipt('add_task_label', {id: 3, label_id: 9}, {label_id: 9})])
		expect(client.getQueryData<PaginatedTaskResponse>(listKey)!.items[0].labels).toEqual([{id: 9, title: 'Urgent'}])
		expect(sdk.tasksRead).not.toHaveBeenCalled()

		sdk.tasksRead.mockResolvedValue({data: {...serverTask, labels: [{id: 9, title: 'Urgent'}, {id: 12, title: 'Fresh'}]}})
		await apply([receipt('add_task_label', {id: 3, label_id: 12}, {label_id: 12})])
		expect(sdk.tasksRead).toHaveBeenCalledWith({path: {task: 3}})
		const listed: TaskResponse = client.getQueryData<PaginatedTaskResponse>(listKey)!.items[0]
		expect(listed.labels.map(label => label.id)).toEqual([9, 12])
		// Embedded data only: other cached fields stay as they were.
		expect(listed.title).toBe('Before')
	})

	it('removes a deleted task from every view, adjusts totals and closes its open detail', async () => {
		const detail = new QueryObserver(client, {
			queryKey: taskKeys.detail(3),
			queryFn: async () => task,
			staleTime: Infinity,
			initialData: task,
		})
		const results: unknown[] = []
		const stop = detail.subscribe(result => results.push(result.error))
		const seen = serverList([])
		const next = normalizeTask({id: 2, project_id: 1, title: 'Moved up from page 2', bucket_id: 8})
		serverBoard([], 29, [next])
		await apply([receipt('delete_task', {id: 3}, {success: true, deleted: true})])
		expect(seen).toEqual([''])
		expect(client.getQueryData<PaginatedTaskResponse>(listKey)).toMatchObject({items: [], total: 0})
		expect(client.getQueryData<BoardData>(boardKey)).toMatchObject({buckets: [{count: 29}], pages: {8: 2}})
		expect(client.getQueryData<BoardData>(boardKey)!.buckets[0].tasks.map(item => item.id)).toEqual([2])
		expect(sdk.projectViewBucketsTasksList).toHaveBeenCalledTimes(1)
		expect(sdk.projectViewTasksList).toHaveBeenCalledTimes(1)
		expect(boardFetch).not.toHaveBeenCalled()
		expect(results.at(-1)).toBeInstanceOf(TaskDeletedError)
		stop()
	})

	it('merges a returned project into the navigation list and detail', async () => {
		const cached = normalizeProject({id: 7, title: 'Thesis', max_permission: 2, views: [{id: 1, title: 'List'}]})
		client.setQueryData<ProjectListResult>(projectKeys.list(), {projects: [cached], favoriteProject: null, savedFilterProjects: []})
		client.setQueryData<ProjectResponse>(projectKeys.detail(7), cached)
		await apply([receipt('set_project_completed', {id: 7, completed: true}, {id: 7, title: 'Thesis', is_completed: true})])
		const listed = client.getQueryData<ProjectListResult>(projectKeys.list())!.projects[0]
		expect(listed).toMatchObject({is_completed: true, max_permission: 2})
		expect(listed.views).toHaveLength(1)
		expect(client.getQueryData<ProjectResponse>(projectKeys.detail(7))).toMatchObject({is_completed: true})
		expect(client.getQueryState(projectTimelineKeys.query({year: 2026}))?.isInvalidated).toBe(true)
		expect(client.getQueryState(['project-history', {year: 2026}])?.isInvalidated).toBe(true)
		expect(client.getQueryState(listKey)?.isInvalidated).toBe(false)
	})
})

describe('embedded task data after receipts', () => {
	let client: QueryClient
	const listKey = taskKeys.list({project: 1})
	const seven: Task = {id: 7, project_id: 1, title: 'Seven'}
	const base = normalizeTask({
		id: 3,
		project_id: 1,
		title: 'Before',
		comment_count: 2,
		related_tasks: {related: [seven]},
	})

	const listed = () => client.getQueryData<PaginatedTaskResponse>(listKey)!.items[0]
	const detail = () => client.getQueryData<TaskResponse>(taskKeys.detail(3))!
	const relatedIds = () => (listed().related_tasks.related ?? []).map(item => item.id)
	const related = (...ids: number[]) => ({related: ids.map(id => ({id, project_id: 1, title: `Task ${id}`}))})

	function deferred<T>() {
		let resolve!: (value: T) => void
		const promise = new Promise<T>(done => {
			resolve = done
		})
		return {promise, resolve}
	}

	async function apply(receipts: AgentReceipt[]) {
		await client.getMutationCache().build(client, agentRefreshMutationOptions()).execute(planAgentRefresh(receipts))
	}

	beforeEach(() => {
		vi.clearAllMocks()
		client = new QueryClient({defaultOptions: {queries: {retry: false}}})
		client.setQueryData<PaginatedTaskResponse>(listKey, {items: [base], total: 1, page: 1, per_page: 50, total_pages: 1})
		client.setQueryData<TaskResponse>(taskKeys.detail(3), base)
		client.setQueryData(commentKeys.task(3), [])
	})

	it('takes the comment count from the server, so a fresher full read is not counted twice', async () => {
		// A full read that already includes Arona's comment landed before the receipt.
		mapTaskEverywhere(client, 3, current => ({...current, comment_count: 3}))
		sdk.tasksRead.mockResolvedValue({data: {...base, comment_count: 3}})
		await apply([receipt('add_comment', {id: 3, comment: 'Done'}, {id: 40, comment: 'Done'})])
		expect(sdk.tasksRead).toHaveBeenCalledWith({path: {task: 3}, query: {expand: ['comment_count']}})
		expect(listed().comment_count).toBe(3)
		expect(detail().comment_count).toBe(3)
		expect(client.getQueryState(commentKeys.task(3))?.isInvalidated).toBe(true)
	})

	it('keeps a comment count that changed while the server count was in flight', async () => {
		sdk.tasksRead.mockImplementation(async () => {
			// The user posts a comment of their own meanwhile.
			mapTaskEverywhere(client, 3, current => ({...current, comment_count: 4}))
			return {data: {...base, comment_count: 3}}
		})
		await apply([receipt('add_comment', {id: 3, comment: 'Done'}, {id: 40, comment: 'Done'})])
		expect(listed().comment_count).toBe(4)
	})

	it('does not request a count no cached copy shows', async () => {
		mapTaskEverywhere(client, 3, ({comment_count: _count, ...current}) => current)
		await apply([receipt('add_comment', {id: 3, comment: 'Done'}, {id: 40, comment: 'Done'})])
		expect(sdk.tasksRead).not.toHaveBeenCalled()
	})

	it('ignores a relation response that a newer request overtook', async () => {
		const older = deferred<{data: Task}>()
		const newer = deferred<{data: Task}>()
		sdk.tasksRead.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
		const first = apply([receipt('relate_tasks', {id: 3, other_task_id: 8, relation_kind: 'related'}, {success: true})])
		await vi.waitFor(() => expect(sdk.tasksRead).toHaveBeenCalledTimes(1))
		const second = apply([receipt('relate_tasks', {id: 3, other_task_id: 9, relation_kind: 'related'}, {success: true})])
		await vi.waitFor(() => expect(sdk.tasksRead).toHaveBeenCalledTimes(2))

		newer.resolve({data: {...base, related_tasks: related(7, 8, 9)}})
		await second
		older.resolve({data: {...base, related_tasks: related(7, 8)}})
		await first
		expect(relatedIds()).toEqual([7, 8, 9])
	})

	it('keeps a relation the user changed while the fetch was in flight', async () => {
		sdk.tasksRead.mockImplementation(async () => {
			// The user's own relation edit and its refresh land first.
			mapTaskEverywhere(client, 3, current => normalizeTask({...current, related_tasks: related(7, 10)}))
			return {data: {...base, related_tasks: related(7, 8)}}
		})
		await apply([receipt('relate_tasks', {id: 3, other_task_id: 8, relation_kind: 'related'}, {success: true})])
		expect(relatedIds()).toEqual([7, 10])
	})

	it('patches assignees from the server, but never from a response older than the cached task', async () => {
		const kim = {id: 2, username: 'kim'}
		sdk.tasksRead.mockResolvedValue({data: {...base, title: 'Server title', assignees: [kim]}})
		await apply([receipt('assign_task', {id: 3, user_id: 2}, {success: true})])
		expect(listed().assignees).toEqual([kim])
		// Embedded data only: other fields keep their cached values.
		expect(listed().title).toBe('Before')

		mapTaskEverywhere(client, 3, current => ({...current, assignees: [], updated: '2026-10-31T12:00:00Z'}))
		sdk.tasksRead.mockResolvedValue({data: {...base, assignees: [kim], updated: '2026-10-31T11:00:00Z'}})
		await apply([receipt('assign_task', {id: 3, user_id: 2}, {success: true})])
		expect(detail().assignees).toEqual([])
	})
})
