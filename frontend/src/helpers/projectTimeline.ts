import type {ProjectTimelineSpan} from '@/client/generated'

// Calendar days are plain YYYY-MM-DD strings from the API, already in the user's zone.
// Arithmetic runs on UTC midnights so no viewer offset or DST change can move a day.

const DAY_MS = 86_400_000

export const TIMELINE_STATUSES = ['all', 'active', 'completed', 'archived'] as const
export type TimelineStatus = typeof TIMELINE_STATUSES[number]

export const HISTORY_TABS = ['timeline', 'lifecycle'] as const
export type HistoryTab = typeof HISTORY_TABS[number]

export function parseTimelineStatus(value: unknown): TimelineStatus {
	return TIMELINE_STATUSES.find(status => status === value) ?? 'all'
}

export function parseHistoryTab(value: unknown): HistoryTab {
	return HISTORY_TABS.find(tab => tab === value) ?? 'timeline'
}

/** Month index 0–11 from a query value, or null. */
export function parseTimelineMonth(value: unknown): number | null {
	if (typeof value !== 'string' || !/^\d{1,2}$/.test(value)) return null
	const month = Number(value) - 1
	return month >= 0 && month < 12 ? month : null
}

export function dayNumber(date: string): number {
	return Math.floor(Date.UTC(
		Number(date.slice(0, 4)),
		Number(date.slice(5, 7)) - 1,
		Number(date.slice(8, 10)),
	) / DAY_MS)
}

export function dateFromDayNumber(day: number): string {
	return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

export interface TimelineDomain {
	start: string
	end: string
	/** Inclusive number of days. */
	length: number
}

/** The whole year, or one month of it. */
export function timelineDomain(year: number, month: number | null = null): TimelineDomain {
	const first = month === null ? Date.UTC(year, 0, 1) : Date.UTC(year, month, 1)
	const next = month === null ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, month + 1, 1)
	const start = Math.floor(first / DAY_MS)
	const end = Math.floor(next / DAY_MS) - 1
	return {
		start: dateFromDayNumber(start),
		end: dateFromDayNumber(end),
		length: end - start + 1,
	}
}

export interface SpanBox {
	start: string
	end: string
	/** Offset from the domain start, in percent. */
	left: number
	width: number
}

/** Clips inclusive spans to the domain and positions them; spans outside are dropped, gaps stay gaps. */
export function placeSpans(spans: readonly ProjectTimelineSpan[], domain: TimelineDomain): SpanBox[] {
	const first = dayNumber(domain.start)
	const last = dayNumber(domain.end)
	const boxes: SpanBox[] = []
	for (const span of spans) {
		if (!span.start || !span.end) continue
		const from = Math.max(first, dayNumber(span.start))
		const to = Math.min(last, dayNumber(span.end))
		if (to < from) continue
		boxes.push({
			start: dateFromDayNumber(from),
			end: dateFromDayNumber(to),
			left: (from - first) / domain.length * 100,
			width: (to - from + 1) / domain.length * 100,
		})
	}
	return boxes
}

/** Position of a single day's centre in the domain, or null when outside. */
export function placeDay(date: string | undefined, domain: TimelineDomain): number | null {
	if (!date) return null
	const offset = dayNumber(date) - dayNumber(domain.start)
	if (offset < 0 || offset >= domain.length) return null
	return (offset + 0.5) / domain.length * 100
}

export interface DomainTick {
	date: string
	left: number
	/** Month index for a year domain, day of month for a month domain. */
	value: number
}

export function domainTicks(domain: TimelineDomain): DomainTick[] {
	const first = dayNumber(domain.start)
	const ticks: DomainTick[] = []
	const yearDomain = domain.length > 31
	for (let day = first; day <= dayNumber(domain.end); day++) {
		const date = dateFromDayNumber(day)
		const dayOfMonth = Number(date.slice(8, 10))
		if (yearDomain ? dayOfMonth === 1 : (dayOfMonth === 1 || dayOfMonth % 7 === 1)) {
			ticks.push({
				date,
				left: (day - first) / domain.length * 100,
				value: yearDomain ? Number(date.slice(5, 7)) - 1 : dayOfMonth,
			})
		}
	}
	return ticks
}

export function spansDayCount(spans: readonly ProjectTimelineSpan[]): number {
	return spans.reduce((total, span) => span.start && span.end
		? total + dayNumber(span.end) - dayNumber(span.start) + 1
		: total, 0)
}

export function spanContains(spans: readonly ProjectTimelineSpan[], date: string): boolean {
	return spans.some(span => !!span.start && !!span.end && span.start <= date && date <= span.end)
}

/** Whole percent, clamped; the bar and the number come from the same value. */
export function progressPercent(progress: number | undefined): number {
	if (!(typeof progress === 'number') || Number.isNaN(progress)) return 0
	return Math.round(Math.min(1, Math.max(0, progress)) * 100)
}

/** The part of the spans strictly after `today`: planned, not yet reached. */
export function futureSpans(spans: readonly ProjectTimelineSpan[], today: string | undefined): ProjectTimelineSpan[] {
	if (!today) return []
	const tomorrow = dateFromDayNumber(dayNumber(today) + 1)
	return spans
		.filter(span => !!span.start && !!span.end && span.end >= tomorrow)
		.map(span => ({
			start: span.start! < tomorrow ? tomorrow : span.start,
			end: span.end,
		}))
}

export type TimelineDayState = 'none' | 'elapsed' | 'planned' | 'unelapsed'

/**
 * planned: scheduled and still ahead. elapsed: scheduled and already passed for at least one
 * open (or later-finished) project. unelapsed: scheduled, today or earlier, yet no project's elapsed span covers it — its work
 * finished before the planned end, or (today) starts later today. The API has no per-day completion, so this claims neither.
 * None of these say how many hours were worked.
 */
export function timelineDayState(
	date: string,
	today: string | undefined,
	day: {scheduled_projects?: number, elapsed_projects?: number} | undefined,
): TimelineDayState {
	if (!day?.scheduled_projects) return 'none'
	if (today && date > today) return 'planned'
	return day.elapsed_projects ? 'elapsed' : 'unelapsed'
}
