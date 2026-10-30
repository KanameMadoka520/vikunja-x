import type {TaskFilterParams, TaskScope} from '@/client/queries/tasks'
import {parseDateOrNull} from '@/helpers/parseDateOrNull'

export const WORKSPACE_TASK_VIEWS = [
	'current',
	'today',
	'overdue',
] as const
export type WorkspaceTaskView = typeof WORKSPACE_TASK_VIEWS[number]

export const DUE_GROUPS = [
	'overdue',
	'today',
	'tomorrow',
	'week',
	'later',
	'none',
] as const
export type DueGroup = typeof DUE_GROUPS[number]

export interface WorkspaceScopeInput {
	view: WorkspaceTaskView
	timezone: string
	labelIds?: string[]
	// The user's "filter used on overview" setting; only the full list honours it.
	savedFilterId?: number | null
}

export function parseWorkspaceTaskView(value: unknown): WorkspaceTaskView {
	return WORKSPACE_TASK_VIEWS.find(view => view === value) ?? 'current'
}

// Datemath instead of ISO timestamps keeps the query key stable between renders,
// so re-rendering the page never refetches.
export function buildWorkspaceTaskScope({
	view,
	timezone,
	labelIds = [],
	savedFilterId = null,
}: WorkspaceScopeInput): TaskScope {
	const filters = ['done = false']
	// Today and overdue are separate queries so a long overdue backlog can never
	// push today's tasks onto a later page.
	if (view === 'today') {
		filters.push('due_date >= \'now/d\'', 'due_date < \'now/d+1d\'')
	}
	if (view === 'overdue') {
		filters.push('due_date < \'now/d\'')
	}
	if (labelIds.length > 0) {
		filters.push(`labels in ${labelIds.join(', ')}`)
	}

	const params: TaskFilterParams = {
		sort_by: [
			'due_date',
			'id',
		],
		order_by: [
			'asc',
			'desc',
		],
		filter: filters.join(' && '),
		filter_include_nulls: false,
		filter_timezone: timezone,
		q: '',
		expand: [
			'comment_count',
			'is_unread',
		],
	}

	const useSavedFilter = view === 'current' && labelIds.length === 0 && savedFilterId
	return {
		project: useSavedFilter ? savedFilterId : null,
		params,
	}
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
	let formatter = dayFormatters.get(timeZone)
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
		})
		dayFormatters.set(timeZone, formatter)
	}
	return formatter
}

// Days since the epoch of the calendar date `date` falls on in `timeZone`.
export function calendarDay(date: Date, timeZone: string): number {
	const parts = dayFormatter(timeZone).formatToParts(date)
	const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value)
	return Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000
}

function groupForDay(due: Date | string | null | undefined, today: number, timeZone: string): DueGroup {
	const date = parseDateOrNull(due)
	if (date === null) return 'none'
	const diff = calendarDay(date, timeZone) - today
	if (diff < 0) return 'overdue'
	if (diff === 0) return 'today'
	if (diff === 1) return 'tomorrow'
	if (diff <= 7) return 'week'
	return 'later'
}

// Days between the calendar dates of `now` and `due` in the user's time zone,
// not between the two instants: 23:59 tonight is still "today".
export function dueGroupOf(due: Date | string | null | undefined, now: Date, timeZone: string): DueGroup {
	return groupForDay(due, calendarDay(now, timeZone), timeZone)
}

// True only when the date alone proves the task falls outside the view; the full list
// may still hide it through labels or a saved filter, which this does not guess.
export function isHiddenFromView(
	due: Date | string | null | undefined,
	view: WorkspaceTaskView,
	now: Date,
	timeZone: string,
): boolean {
	if (view === 'current') return false
	return dueGroupOf(due, now, timeZone) !== view
}

export interface TaskGroup<T> {
	key: DueGroup
	tasks: T[]
}

// Keeps the server order inside each group and drops empty groups.
export function groupTasksByDue<T extends {due_date?: string | null}>(
	tasks: T[],
	now: Date,
	timeZone: string,
): TaskGroup<T>[] {
	const today = calendarDay(now, timeZone)
	const buckets = new Map<DueGroup, T[]>(DUE_GROUPS.map(key => [key, []]))
	for (const task of tasks) {
		buckets.get(groupForDay(task.due_date, today, timeZone))!.push(task)
	}
	return DUE_GROUPS
		.map(key => ({key, tasks: buckets.get(key)!}))
		.filter(group => group.tasks.length > 0)
}
