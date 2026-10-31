import {watch} from 'vue'
import {useEventListener} from '@vueuse/core'
import {useQueryClient} from '@tanstack/vue-query'

import type {Task} from '@/client/generated'
import {kanbanKeys, type BoardData} from '@/client/queries/kanban'
import {taskKeys, type PaginatedTaskResponse, type TaskResponse} from '@/client/queries/tasks'
import {useRefreshTaskRoutinesMutation} from '@/client/queries/taskRoutines'
import {useGlobalNow} from '@/composables/useGlobalNow'
import {hasRoutineDayEnded, routineOf} from '@/helpers/taskRoutine'

// A focus burst (alt-tab back and forth) reads each routine once.
const FOCUS_INTERVAL = 30_000
// When the server's day lags the browser's clock, the summary still says yesterday; ask again at most this often.
const ROLLOVER_INTERVAL = 60_000
// Reads per request batch; further batches follow right after, so no routine waits behind the first ones.
const BATCH_SIZE = 50

/**
 * Mounted once by the app shell. Routine rows already switch to "pending" at the stored next_reset_at, so
 * nothing waits on this to look right; it re-reads the routines of the tasks open pages show when a new
 * local day starts and when the window becomes visible again (another member may have checked in).
 * One shared 60 s clock drives it, never a timer per row.
 */
export function useRoutineDayRefresh() {
	const client = useQueryClient()
	const refresh = useRefreshTaskRoutinesMutation()
	const {now} = useGlobalNow()
	// When each routine was last read, so batches go to the ones read longest ago and a summary the server
	// still answers with yesterday is not asked for again on every tick.
	const lastRead = new Map<number, number>()

	function visibleRoutineTasks(): Task[] {
		const found = new Map<number, Task>()
		const add = (tasks: readonly Task[] | undefined) => tasks?.forEach(task => {
			if (task.id !== undefined && routineOf(task)?.enabled) found.set(task.id, task)
		})
		for (const query of client.getQueryCache().findAll({type: 'active'})) {
			const [root, kind] = query.queryKey
			const data = query.state.data
			if (!data) continue
			if (root === kanbanKeys.all[0]) {
				(data as BoardData).buckets?.forEach(bucket => add(bucket.tasks))
			} else if (root === taskKeys.all[0] && kind === taskKeys.details[1]) {
				add([data as TaskResponse])
			} else if (root === taskKeys.all[0] && kind === taskKeys.lists[1]) {
				add((data as PaginatedTaskResponse).items)
			} else if (root === taskKeys.all[0] && kind === taskKeys.allLists[1]) {
				add(data as TaskResponse[])
			}
		}
		return [...found.values()]
	}

	function dayEnded(task: Task, at: Date): boolean {
		const routine = routineOf(task)
		return routine !== null && !routine.paused && hasRoutineDayEnded(routine, at)
	}

	// Ended days first (those rows are known to be outdated), then the least recently read.
	function candidates(onlyEnded: boolean, minInterval: number): number[] {
		const at = new Date()
		const due = (id: number) => at.getTime() - (lastRead.get(id) ?? 0) >= minInterval
		return visibleRoutineTasks()
			.filter(task => due(task.id!) && (!onlyEnded || dayEnded(task, at)))
			.sort((a, b) => Number(dayEnded(b, at)) - Number(dayEnded(a, at))
				|| (lastRead.get(a.id!) ?? 0) - (lastRead.get(b.id!) ?? 0))
			.map(task => task.id!)
	}

	// Own flag rather than the mutation's isPending: that ref may not have caught up when onSettled runs.
	let running = false
	// A focus arriving while a rollover batch runs is kept and served when that batch settles.
	let focusWaiting = false

	function run(onlyEnded: boolean, minInterval: number) {
		if (running) {
			focusWaiting ||= !onlyEnded
			return
		}
		if (!onlyEnded) focusWaiting = false
		const ids = candidates(onlyEnded, minInterval).slice(0, BATCH_SIZE)
		if (!ids.length) return
		const readAt = Date.now()
		ids.forEach(id => lastRead.set(id, readAt))
		running = true
		// The ids just read are no longer due, so the next batch takes the following ones until none are left.
		refresh.mutate(ids, {
			onSettled: () => {
				running = false
				if (focusWaiting) run(false, FOCUS_INTERVAL)
				else run(onlyEnded, minInterval)
			},
		})
	}

	watch(now, () => run(true, ROLLOVER_INTERVAL))

	useEventListener(document, 'visibilitychange', () => {
		if (document.visibilityState === 'visible') run(false, FOCUS_INTERVAL)
	})
	useEventListener(window, 'focus', () => run(false, FOCUS_INTERVAL))
}
