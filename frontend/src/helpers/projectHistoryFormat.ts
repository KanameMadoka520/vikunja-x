import type {IconProp} from '@fortawesome/fontawesome-svg-core'

// These are project lifecycle events, not task completions: archiving is not completing.
export const HISTORY_EVENT_KINDS = ['completed', 'archived', 'reopened', 'unarchived'] as const
export type HistoryEventKind = typeof HISTORY_EVENT_KINDS[number]

// The server default (completed + archived) comes first, then the widest view, then single kinds.
export const HISTORY_KIND_FILTERS = ['milestones', 'all', ...HISTORY_EVENT_KINDS] as const
export type HistoryKindFilter = typeof HISTORY_KIND_FILTERS[number]

const EVENT_ICONS: Record<HistoryEventKind, IconProp> = {
	completed: 'check',
	archived: 'archive',
	reopened: 'undo',
	unarchived: 'arrow-up-from-bracket',
}

export const HEAT_LEVELS = [0, 1, 2, 3, 4] as const
export type HeatLevel = typeof HEAT_LEVELS[number]

export function parseHistoryKind(value: unknown): HistoryKindFilter {
	return HISTORY_KIND_FILTERS.find(kind => kind === value) ?? 'milestones'
}

export function parseHistoryEventKind(value: unknown): HistoryEventKind | null {
	return HISTORY_EVENT_KINDS.find(kind => kind === value) ?? null
}

export function historyEventIcon(kind: unknown): IconProp {
	const known = parseHistoryEventKind(kind)
	return known ? EVENT_ICONS[known] : 'history'
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function calendarDayToUtc(value: string): Date | null {
	const match = CALENDAR_DAY.exec(value)
	if (!match) return null
	const [year, month, day] = match.slice(1).map(Number)
	const date = new Date(Date.UTC(year, month - 1, day))
	// Date.UTC rolls 2024-02-30 into March and maps years below 100 to the 1900s; reject both.
	const exact = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	return exact ? date : null
}

/**
 * Returns the YYYY-MM-DD day when it is a real date inside `year`, otherwise ''.
 * The API rejects days outside the requested year, so they are dropped here instead.
 */
export function parseCalendarDay(value: unknown, year: number): string {
	if (typeof value !== 'string') return ''
	const date = calendarDayToUtc(value)
	return date && date.getUTCFullYear() === year ? value : ''
}

/**
 * Builds a formatter for YYYY-MM-DD calendar days. A day is a plain date, not an instant,
 * so it is anchored at UTC midnight and formatted in UTC: no viewer offset can move it.
 * Invalid input is returned unchanged.
 */
export function calendarDayFormatter(
	locale: string,
	options: Intl.DateTimeFormatOptions = {dateStyle: 'medium'},
): (value: string) => string {
	const format = new Intl.DateTimeFormat(locale, {
		...options,
		timeZone: 'UTC',
	})
	return value => {
		const date = calendarDayToUtc(value)
		return date ? format.format(date) : value
	}
}

export function formatCalendarDay(
	value: string,
	locale: string,
	options?: Intl.DateTimeFormatOptions,
): string {
	return calendarDayFormatter(locale, options)(value)
}

export function formatCalendarMonth(
	year: number,
	month: number,
	locale: string,
	options: Intl.DateTimeFormatOptions = {month: 'short'},
): string {
	return new Intl.DateTimeFormat(locale, {
		...options,
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(year, month, 1)))
}

/**
 * Legacy archives are stored without a date and arrive as null or Go's zero time
 * (0001-01-01…). Anything at or before the Unix epoch is treated as unknown rather than shown.
 */
export function isUnknownInstant(value: string | null | undefined): boolean {
	if (!value) return true
	const time = Date.parse(value)
	return Number.isNaN(time) || time <= 0
}

/** Formats a recorded instant as a date in the user's time zone, or null when it is unknown. */
export function formatInstantDate(value: string | null | undefined, locale: string, timeZone: string): string | null {
	if (isUnknownInstant(value)) return null
	return new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeZone,
	}).format(new Date(value as string))
}

/** Maps a day's event count to a heatmap level relative to the busiest day; any activity is at least level 1. */
export function heatLevel(count: number, max: number): HeatLevel {
	if (!(count > 0)) return 0
	const level = Math.ceil(count / Math.max(1, max) * 4)
	return Math.min(4, Math.max(1, level)) as HeatLevel
}
