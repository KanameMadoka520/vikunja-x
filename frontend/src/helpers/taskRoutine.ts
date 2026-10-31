// Daily routines: a task checked in once per local day of the routine's timezone, for the whole project.
// The check-in lives in its own record; the task's `done` and repeat settings never change with it.

export interface TaskRoutineSummary {
	enabled: boolean
	paused: boolean
	timezone: string
	revision: number
	// The server's "today" (YYYY-MM-DD in `timezone`) when the summary was computed.
	date: string
	completed_today: boolean
	// '' when there is no check-in for `date`.
	completed_at: string
	completed_by_id: number
	// The next local midnight; '' when the server sent none.
	next_reset_at: string
}

// What the API sends: every field may be missing, and unset times arrive as Go's zero time.
export type RawTaskRoutine = {
	enabled?: boolean | null
	paused?: boolean | null
	timezone?: string | null
	revision?: number | null
	date?: string | null
	completed_today?: boolean | null
	completed_at?: string | null
	completed_by_id?: number | null
	next_reset_at?: string | null
}

export type RoutineStatus = 'pending' | 'done' | 'paused'

const ZERO_TIME = /^0001-01-01/
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

function timeOrEmpty(value?: string | null): string {
	return value && !ZERO_TIME.test(value) && !Number.isNaN(Date.parse(value)) ? value : ''
}

export function normalizeTaskRoutine(raw: RawTaskRoutine | null | undefined): TaskRoutineSummary | null {
	if (!raw) return null
	const completedAt = timeOrEmpty(raw.completed_at)
	return {
		enabled: raw.enabled === true,
		paused: raw.paused === true,
		timezone: raw.timezone ?? '',
		revision: raw.revision ?? 0,
		date: raw.date && LOCAL_DATE.test(raw.date) ? raw.date : '',
		completed_today: raw.completed_today === true && completedAt !== '',
		completed_at: completedAt,
		completed_by_id: raw.completed_by_id ?? 0,
		next_reset_at: timeOrEmpty(raw.next_reset_at),
	}
}

/** The routine summary embedded in a task read, or null when the task never had one. */
export function routineOf(task: {routine?: RawTaskRoutine | null} | null | undefined): TaskRoutineSummary | null {
	return normalizeTaskRoutine(task?.routine)
}

/** Enabled routines replace the ordinary done action; a disabled one only keeps its history. */
export function isRoutineTask(task: {routine?: RawTaskRoutine | null} | null | undefined): boolean {
	return routineOf(task)?.enabled === true
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/** The calendar date (YYYY-MM-DD) `date` falls on in `timeZone`; '' for an unknown zone. */
export function localDate(date: Date, timeZone: string): string {
	let formatter = dateFormatters.get(timeZone)
	if (!formatter) {
		try {
			formatter = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'})
		} catch {
			return ''
		}
		dateFormatters.set(timeZone, formatter)
	}
	const parts = formatter.formatToParts(date)
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
	return `${part('year')}-${part('month')}-${part('day')}`
}

/** Whether the local day the summary describes is over, so it must not be shown as today's state anymore. */
export function hasRoutineDayEnded(routine: TaskRoutineSummary, now: Date): boolean {
	const reset = Date.parse(routine.next_reset_at)
	if (!Number.isNaN(reset)) return now.getTime() >= reset
	const today = localDate(now, routine.timezone)
	return routine.date !== '' && today !== '' && routine.date !== today
}

export function isCheckedInToday(routine: TaskRoutineSummary, now: Date): boolean {
	return routine.completed_today && !hasRoutineDayEnded(routine, now)
}

/** Null for a task that is not an enabled routine. */
export function routineStatus(routine: TaskRoutineSummary | null, now: Date): RoutineStatus | null {
	if (!routine?.enabled) return null
	if (routine.paused) return 'paused'
	return isCheckedInToday(routine, now) ? 'done' : 'pending'
}

/**
 * The date a check-in or undo sends. The server accepts only its own "today" in the routine's zone and
 * answers 409 otherwise, so a page left open over midnight cannot write the previous day.
 */
export function routineToday(routine: TaskRoutineSummary, now: Date): string {
	if (routine.date && !hasRoutineDayEnded(routine, now)) return routine.date
	return localDate(now, routine.timezone) || routine.date
}

/** Year and month (1–12) of the routine's current local day, for the history calendar. */
export function routineMonth(routine: TaskRoutineSummary, now: Date): {year: number, month: number} {
	const [year, month] = routineToday(routine, now).split('-').map(Number)
	if (year && month) return {year, month}
	return {year: now.getUTCFullYear(), month: now.getUTCMonth() + 1}
}

/** The earliest moment one of these routines starts a new day, or undefined when none is known. */
export function nextRoutineReset(routines: readonly TaskRoutineSummary[], now: Date): number | undefined {
	let next: number | undefined
	for (const routine of routines) {
		if (!routine.enabled || routine.paused) continue
		const reset = Date.parse(routine.next_reset_at)
		if (Number.isNaN(reset) || reset <= now.getTime()) continue
		next = next === undefined ? reset : Math.min(next, reset)
	}
	return next
}
