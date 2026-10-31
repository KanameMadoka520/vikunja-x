import {hashKey, type QueryClient, type QueryKey} from '@tanstack/vue-query'
import {projectViewBucketsTasksList, projectViewTasksList, type Task} from '@/client/generated'
import {assertClientRequestContext, captureClientRequestContext, isClientRequestContextCurrent, type ClientRequestContext} from '@/client/requestContext'
import {normalizeTask, type TaskFilterParams} from './tasks'
import {BUCKET_TASK_PARAMS, TASKS_PER_BUCKET, kanbanKeys, normalizeBucket, type BoardData} from './kanban'

export type AgentBoardScope = {projectIds: readonly number[], taskIds?: readonly number[]}

function containsTask(tasks: readonly Task[], ids: Set<number>, visited = new Set<number>()): boolean {
	return tasks.some(task => {
		if (task.id === undefined || visited.has(task.id)) return false
		if (ids.has(task.id)) return true
		visited.add(task.id)
		return Object.values(task.related_tasks ?? {}).some(related => containsTask(related ?? [], ids, visited))
	})
}

/** Capture before patching/moving cards, while the source project is still identifiable. */
export function agentBoardKeys(client: QueryClient, scope: AgentBoardScope): QueryKey[] {
	const projects = new Set(scope.projectIds.filter(id => id > 0))
	const tasks = new Set(scope.taskIds ?? [])
	if (!projects.size && !tasks.size) return []
	return client.getQueryCache().findAll({queryKey: kanbanKeys.all, type: 'active'})
		.filter(query => {
			const project = kanbanKeys.projectOf(query.queryKey)
			const board = query.state.data as BoardData | undefined
			// Saved filters/favorites span projects: only the server can decide their membership.
			return board && project !== undefined && (project < 0 || projects.has(project)
				|| board.buckets.some(bucket => containsTask(bucket.tasks, tasks)))
		})
		.map(query => query.queryKey)
}

async function readLoadedBoard(key: QueryKey, previous: BoardData, signal: AbortSignal, context: ClientRequestContext): Promise<BoardData> {
	assertClientRequestContext(context)
	signal.throwIfAborted()
	const project = kanbanKeys.projectOf(key)!
	const view = kanbanKeys.viewOf(key)!
	const params = (key[3] ?? {}) as TaskFilterParams
	const {data} = await projectViewBucketsTasksList({
		path: {project, view}, query: {...params, ...BUCKET_TASK_PARAMS}, signal,
	})
	assertClientRequestContext(context)
	signal.throwIfAborted()
	const pages: Record<number, number> = {}
	const buckets = await Promise.all((data.items ?? []).map(async raw => {
		const bucket = normalizeBucket(raw)
		const depth = Math.min(Math.max(1, previous.pages[bucket.id] ?? 1), Math.max(1, Math.ceil(bucket.count / TASKS_PER_BUCKET)))
		const extra = await Promise.all(Array.from({length: depth - 1}, async (_, index) => {
			assertClientRequestContext(context)
			signal.throwIfAborted()
			const response = await projectViewTasksList({
				path: {project, view},
				query: {
					...params,
					...BUCKET_TASK_PARAMS,
					page: index + 2,
					sort_by: ['position'],
					order_by: ['asc'],
					filter: `${params.filter ? `(${params.filter}) && ` : ''}bucket_id = ${bucket.id}`,
				},
				signal,
			})
			assertClientRequestContext(context)
			return (response.data.items ?? []).map(normalizeTask)
		}))
		pages[bucket.id] = depth
		const seen = new Set<number>()
		return {...bucket, tasks: [...bucket.tasks, ...extra.flat()].filter(task => {
			if (seen.has(task.id)) return false
			seen.add(task.id)
			return true
		})}
	}))
	return {buckets, pages}
}

type RefreshJob = {requested: number, promise: Promise<void>, context: ClientRequestContext}
const jobs = new WeakMap<QueryClient, Map<string, RefreshJob>>()

/**
 * Reconcile visible boards through the actual filters without resetting loaded depth. Keep the old
 * board visible until every loaded page succeeds. Coalesce overlapping receipts and retry if a local
 * edit/load-more changes the cache while the response is in flight. An inactive/removed query or an
 * account switch aborts the work. No generic invalidate/refetch (which loads only page one).
 */
export async function refreshAgentBoards(client: QueryClient, keys: readonly QueryKey[]): Promise<void> {
	let active = jobs.get(client)
	if (!active) {
		active = new Map()
		jobs.set(client, active)
	}
	const unique = new Map(keys.map(key => [hashKey(key), key]))
	await Promise.all([...unique].map(([hash, key]) => {
		const existing = active.get(hash)
		if (existing && isClientRequestContextCurrent(existing.context)) {
			existing.requested++
			return existing.promise
		}
		const job: RefreshJob = {requested: 1, promise: Promise.resolve(), context: captureClientRequestContext()}
		active.set(hash, job)
		job.promise = reconcileBoard(client, key, job).finally(() => {
			if (active.get(hash) === job) active.delete(hash)
		})
		return job.promise
	}))
}

async function reconcileBoard(client: QueryClient, key: QueryKey, job: RefreshJob) {
	const query = client.getQueryCache().find({queryKey: key, exact: true})
	if (!query?.isActive() || !query.state.data) return
	const context = job.context
	const controller = new AbortController()
	const unsubscribe = client.getQueryCache().subscribe(event => {
		if (event.query === query && (event.type === 'removed' || !query.isActive())) controller.abort()
	})
	try {
		// Stop an older first-page request without rolling back newer optimistic/local data.
		await client.cancelQueries({queryKey: key, exact: true}, {revert: false, silent: true})
		while (!controller.signal.aborted && query.isActive()) {
			assertClientRequestContext(context)
			const request = job.requested
			const revision = query.state.dataUpdateCount
			const previous = query.state.data as BoardData
			const next = await readLoadedBoard(key, previous, controller.signal, context)
			assertClientRequestContext(context)
			if (controller.signal.aborted || !query.isActive()) return
			// A new receipt, drag or loaded page wins over this older request. Read its latest depth.
			if (request !== job.requested || revision !== query.state.dataUpdateCount) continue
			client.setQueryData<BoardData>(key, next)
			return
		}
	} catch (error) {
		if (!controller.signal.aborted) throw error
	} finally {
		controller.abort()
		unsubscribe()
	}
}
