import {describe, expect, it} from 'vitest'

import {
	buildWorkspaceTaskScope,
	calendarDay,
	dueGroupOf,
	groupTasksByDue,
	isHiddenFromView,
	parseWorkspaceTaskView,
} from './workspaceTasks'

describe('buildWorkspaceTaskScope', () => {
	it('lists every open task for the current view, including undated ones', () => {
		const scope = buildWorkspaceTaskScope({
			view: 'current',
			timezone: 'Asia/Shanghai',
		})
		expect(scope.project).toBeNull()
		expect(scope.params?.filter).toBe('done = false')
		expect(scope.params?.filter_timezone).toBe('Asia/Shanghai')
	})

	it('limits the today view to today only with stable datemath', () => {
		const scope = buildWorkspaceTaskScope({
			view: 'today',
			timezone: 'UTC',
		})
		expect(scope.params?.filter).toBe('done = false && due_date >= \'now/d\' && due_date < \'now/d+1d\'')
		expect(scope.params?.filter_include_nulls).toBe(false)
	})

	it('keeps overdue tasks in their own query', () => {
		const scope = buildWorkspaceTaskScope({
			view: 'overdue',
			timezone: 'UTC',
		})
		expect(scope.params?.filter).toBe('done = false && due_date < \'now/d\'')
		expect(scope.params?.filter_include_nulls).toBe(false)
	})

	it('produces equal scopes for equal input so the query key does not change', () => {
		const input = {
			view: 'today' as const,
			timezone: 'UTC',
		}
		expect(buildWorkspaceTaskScope(input)).toEqual(buildWorkspaceTaskScope(input))
	})

	it('uses the overview saved filter only for the current view without labels', () => {
		expect(buildWorkspaceTaskScope({
			view: 'current',
			timezone: 'UTC',
			savedFilterId: -3,
		}).project).toBe(-3)
		expect(buildWorkspaceTaskScope({
			view: 'today',
			timezone: 'UTC',
			savedFilterId: -3,
		}).project).toBeNull()
		expect(buildWorkspaceTaskScope({
			view: 'current',
			timezone: 'UTC',
			savedFilterId: -3,
			labelIds: ['4'],
		}).project).toBeNull()
	})

	it('adds the label filter to either view', () => {
		expect(buildWorkspaceTaskScope({
			view: 'today',
			timezone: 'UTC',
			labelIds: [
				'1',
				'2',
			],
		}).params?.filter).toBe('done = false && due_date >= \'now/d\' && due_date < \'now/d+1d\' && labels in 1, 2')
	})
})

describe('parseWorkspaceTaskView', () => {
	it('falls back to the current view for unknown values', () => {
		expect(parseWorkspaceTaskView('today')).toBe('today')
		expect(parseWorkspaceTaskView('overdue')).toBe('overdue')
		expect(parseWorkspaceTaskView('week')).toBe('current')
		expect(parseWorkspaceTaskView(null)).toBe('current')
	})
})

describe('dueGroupOf', () => {
	// 2026-10-31 10:00 in Shanghai
	const now = new Date('2026-10-31T02:00:00Z')

	it('compares calendar days in the user time zone, not instants', () => {
		expect(dueGroupOf('2026-10-31T15:59:00Z', now, 'Asia/Shanghai')).toBe('today')
		expect(dueGroupOf('2026-10-31T16:00:00Z', now, 'Asia/Shanghai')).toBe('tomorrow')
		expect(dueGroupOf('2026-10-30T15:59:00Z', now, 'Asia/Shanghai')).toBe('overdue')
	})

	it('treats a time earlier today as today, not overdue', () => {
		expect(dueGroupOf('2026-10-31T00:30:00Z', now, 'Asia/Shanghai')).toBe('today')
	})

	it('gives the same instant a different day in another time zone', () => {
		const due = '2026-10-30T20:00:00Z'
		const later = new Date('2026-10-31T05:00:00Z')
		expect(dueGroupOf(due, later, 'Asia/Shanghai')).toBe('today')
		expect(dueGroupOf(due, later, 'America/New_York')).toBe('overdue')
	})

	it('buckets the rest of the week and later dates', () => {
		expect(dueGroupOf('2026-11-07T04:00:00Z', now, 'Asia/Shanghai')).toBe('week')
		expect(dueGroupOf('2026-11-08T04:00:00Z', now, 'Asia/Shanghai')).toBe('later')
	})

	it('treats missing and zero dates as undated', () => {
		expect(dueGroupOf(null, now, 'UTC')).toBe('none')
		expect(dueGroupOf(undefined, now, 'UTC')).toBe('none')
		expect(dueGroupOf('0001-01-01T00:00:00Z', now, 'UTC')).toBe('none')
	})
})

describe('isHiddenFromView', () => {
	const now = new Date('2026-10-31T02:00:00Z')

	it('flags an undated capture made while the today or overdue view is open', () => {
		expect(isHiddenFromView(null, 'today', now, 'Asia/Shanghai')).toBe(true)
		expect(isHiddenFromView(null, 'overdue', now, 'Asia/Shanghai')).toBe(true)
	})

	it('keeps a capture due today visible in the today view only', () => {
		const tonight = '2026-10-31T13:00:00Z'
		expect(isHiddenFromView(tonight, 'today', now, 'Asia/Shanghai')).toBe(false)
		expect(isHiddenFromView(tonight, 'overdue', now, 'Asia/Shanghai')).toBe(true)
	})

	it('never claims a task is hidden from the full list', () => {
		expect(isHiddenFromView(null, 'current', now, 'Asia/Shanghai')).toBe(false)
	})
})

describe('calendarDay', () => {
	it('rolls over at local midnight of the given time zone', () => {
		const beforeMidnight = calendarDay(new Date('2026-10-31T15:59:00Z'), 'Asia/Shanghai')
		const afterMidnight = calendarDay(new Date('2026-10-31T16:00:00Z'), 'Asia/Shanghai')
		expect(afterMidnight - beforeMidnight).toBe(1)
		expect(calendarDay(new Date('2026-10-31T16:00:00Z'), 'UTC')).toBe(beforeMidnight)
	})
})

describe('groupTasksByDue', () => {
	it('keeps server order inside groups and drops empty groups', () => {
		const now = new Date('2026-10-31T12:00:00Z')
		const task = (id: number, due_date: string | null) => ({
			id,
			due_date,
		})
		const tasks = [
			task(1, '2026-10-29T12:00:00Z'),
			task(2, '2026-10-31T18:00:00Z'),
			task(3, '2026-10-28T12:00:00Z'),
			task(4, null),
		]
		expect(groupTasksByDue(tasks, now, 'UTC')).toEqual([
			{
				key: 'overdue',
				tasks: [
					tasks[0],
					tasks[2],
				],
			},
			{
				key: 'today',
				tasks: [tasks[1]],
			},
			{
				key: 'none',
				tasks: [tasks[3]],
			},
		])
	})
})
