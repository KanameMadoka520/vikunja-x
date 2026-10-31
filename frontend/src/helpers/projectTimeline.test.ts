import {describe, expect, it} from 'vitest'

import {
	domainTicks,
	futureSpans,
	parseHistoryTab,
	parseTimelineMonth,
	parseTimelineStatus,
	placeDay,
	placeSpans,
	progressPercent,
	spanContains,
	spansDayCount,
	timelineDayState,
	timelineDomain,
} from './projectTimeline'

describe('timelineDomain', () => {
	it('covers a leap year and a single month inclusively', () => {
		expect(timelineDomain(2024)).toEqual({
			start: '2024-01-01',
			end: '2024-12-31',
			length: 366,
		})
		expect(timelineDomain(2026, 1)).toEqual({
			start: '2026-02-01',
			end: '2026-02-28',
			length: 28,
		})
	})
})

describe('placeSpans', () => {
	const year = timelineDomain(2026)

	it('keeps gaps between separate spans instead of merging them', () => {
		const boxes = placeSpans([
			{start: '2026-01-01', end: '2026-01-10'},
			{start: '2026-01-20', end: '2026-01-20'},
		], year)
		expect(boxes).toHaveLength(2)
		expect(boxes[0].left).toBe(0)
		expect(boxes[0].width).toBeCloseTo(10 / 365 * 100)
		expect(boxes[1].left).toBeCloseTo(19 / 365 * 100)
		expect(boxes[1].width).toBeCloseTo(1 / 365 * 100)
	})

	it('clips to a month and drops spans outside it', () => {
		const march = timelineDomain(2026, 2)
		const boxes = placeSpans([
			{start: '2026-02-20', end: '2026-03-05'},
			{start: '2026-04-01', end: '2026-04-02'},
		], march)
		expect(boxes).toEqual([{
			start: '2026-03-01',
			end: '2026-03-05',
			left: 0,
			width: 5 / 31 * 100,
		}])
	})

	it('ignores spans with a missing bound', () => {
		expect(placeSpans([{start: '2026-01-01'}], year)).toEqual([])
	})
})

describe('placeDay and ticks', () => {
	it('places a day at its centre and rejects days outside the domain', () => {
		const march = timelineDomain(2026, 2)
		expect(placeDay('2026-03-01', march)).toBeCloseTo(0.5 / 31 * 100)
		expect(placeDay('2026-04-01', march)).toBeNull()
		expect(placeDay(undefined, march)).toBeNull()
	})

	it('ticks months for a year and weeks for a month', () => {
		expect(domainTicks(timelineDomain(2026)).map(tick => tick.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
		expect(domainTicks(timelineDomain(2026, 1)).map(tick => tick.value)).toEqual([1, 8, 15, 22])
	})
})

describe('span arithmetic', () => {
	const spans = [
		{start: '2026-03-01', end: '2026-03-03'},
		{start: '2026-03-10', end: '2026-03-10'},
	]

	it('counts inclusive days and membership', () => {
		expect(spansDayCount(spans)).toBe(4)
		expect(spanContains(spans, '2026-03-03')).toBe(true)
		expect(spanContains(spans, '2026-03-05')).toBe(false)
	})

	it('keeps only the part after today as planned', () => {
		expect(futureSpans(spans, '2026-03-02')).toEqual([
			{start: '2026-03-03', end: '2026-03-03'},
			{start: '2026-03-10', end: '2026-03-10'},
		])
		expect(futureSpans(spans, '2026-03-10')).toEqual([])
		expect(futureSpans(spans, undefined)).toEqual([])
	})
})

describe('timelineDayState', () => {
	it('separates planned, elapsed and not-yet-elapsed coverage', () => {
		expect(timelineDayState('2026-03-01', '2026-03-02', undefined)).toBe('none')
		expect(timelineDayState('2026-03-01', '2026-03-02', {deadlines: 1} as never)).toBe('none')
		expect(timelineDayState('2026-03-05', '2026-03-02', {scheduled_projects: 1, elapsed_projects: 0})).toBe('planned')
		expect(timelineDayState('2026-03-01', '2026-03-02', {scheduled_projects: 2, elapsed_projects: 1})).toBe('elapsed')
		// Scheduled but every project there finished before this day.
		expect(timelineDayState('2026-03-01', '2026-03-02', {scheduled_projects: 1, elapsed_projects: 0})).toBe('unelapsed')
		// A task starting later today covers today without having elapsed: not "finished", not "planned" either.
		expect(timelineDayState('2026-03-02', '2026-03-02', {scheduled_projects: 1, elapsed_projects: 0})).toBe('unelapsed')
	})
})

describe('parsers and progress', () => {
	it('falls back to defaults on unknown query values', () => {
		expect(parseTimelineStatus('archived')).toBe('archived')
		expect(parseTimelineStatus('bogus')).toBe('all')
		expect(parseHistoryTab('lifecycle')).toBe('lifecycle')
		expect(parseHistoryTab(undefined)).toBe('timeline')
		expect(parseTimelineMonth('3')).toBe(2)
		expect(parseTimelineMonth('13')).toBeNull()
		expect(parseTimelineMonth('1.5')).toBeNull()
	})

	it('rounds and clamps progress', () => {
		expect(progressPercent(0.625)).toBe(63)
		expect(progressPercent(1.2)).toBe(100)
		expect(progressPercent(undefined)).toBe(0)
		expect(progressPercent(Number.NaN)).toBe(0)
	})
})
