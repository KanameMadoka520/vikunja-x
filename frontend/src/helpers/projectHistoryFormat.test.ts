import {afterEach, describe, expect, it} from 'vitest'
import {createI18n} from 'vue-i18n'

import en from '@/i18n/lang/en.json'
import zh from '@/i18n/lang/zh-CN.json'
import {
	HISTORY_KIND_FILTERS,
	formatCalendarDay,
	formatCalendarMonth,
	formatInstantDate,
	heatLevel,
	historyEventIcon,
	isUnknownInstant,
	parseCalendarDay,
	parseHistoryEventKind,
	parseHistoryKind,
} from './projectHistoryFormat'

const originalTimeZone = process.env.TZ

afterEach(() => {
	process.env.TZ = originalTimeZone
})

describe('history kind filters', () => {
	it('lists the default first, then all, then each event kind once', () => {
		expect(HISTORY_KIND_FILTERS).toEqual(['milestones', 'all', 'completed', 'archived', 'reopened', 'unarchived'])
	})

	it('falls back to milestones for missing or unknown kinds', () => {
		expect(parseHistoryKind('reopened')).toBe('reopened')
		expect(parseHistoryKind('all')).toBe('all')
		expect(parseHistoryKind(undefined)).toBe('milestones')
		expect(parseHistoryKind('deleted')).toBe('milestones')
		expect(parseHistoryKind(['all'])).toBe('milestones')
	})

	it('only accepts real event kinds for badges', () => {
		expect(parseHistoryEventKind('archived')).toBe('archived')
		expect(parseHistoryEventKind('milestones')).toBeNull()
		expect(parseHistoryEventKind('all')).toBeNull()
	})

	it('gives every event kind its own icon and a neutral fallback', () => {
		const icons = ['completed', 'archived', 'reopened', 'unarchived'].map(historyEventIcon)
		expect(new Set(icons).size).toBe(4)
		expect(historyEventIcon('completed')).toBe('check')
		expect(historyEventIcon('archived')).toBe('archive')
		expect(historyEventIcon('something-new')).toBe('history')
	})
})

describe('calendar days', () => {
	it('accepts only real days inside the selected year', () => {
		expect(parseCalendarDay('2024-02-29', 2024)).toBe('2024-02-29')
		expect(parseCalendarDay('2023-02-29', 2023)).toBe('')
		expect(parseCalendarDay('2024-02-30', 2024)).toBe('')
		expect(parseCalendarDay('2024-13-01', 2024)).toBe('')
		expect(parseCalendarDay('2025-01-01', 2024)).toBe('')
		expect(parseCalendarDay('0050-01-01', 50)).toBe('')
		expect(parseCalendarDay('2024-1-1', 2024)).toBe('')
		expect(parseCalendarDay(undefined, 2024)).toBe('')
		expect(parseCalendarDay(['2024-01-01'], 2024)).toBe('')
	})

	it('formats a day as a localized date instead of the raw ISO string', () => {
		expect(formatCalendarDay('2026-10-31', 'en')).toBe('Oct 31, 2026')
		expect(formatCalendarDay('2026-10-31', 'zh-CN')).toBe('2026年10月31日')
		expect(formatCalendarDay('2026-10-31', 'en', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		})).toBe('Sat, Oct 31, 2026')
		expect(formatCalendarDay('not-a-day', 'en')).toBe('not-a-day')
	})

	it.each([
		'Pacific/Kiritimati',
		'America/Los_Angeles',
		'Pacific/Pago_Pago',
		'Asia/Shanghai',
	])('never shifts the day when the viewer is in %s', timeZone => {
		process.env.TZ = timeZone
		expect(formatCalendarDay('2026-01-01', 'en')).toBe('Jan 1, 2026')
		expect(formatCalendarDay('2026-10-31', 'en')).toBe('Oct 31, 2026')
		expect(formatCalendarDay('2024-12-31', 'en')).toBe('Dec 31, 2024')
		expect(formatCalendarMonth(2026, 0, 'en', {
			month: 'long',
			year: 'numeric',
		})).toBe('January 2026')
	})

	it('names months for the picker and its labels', () => {
		expect(formatCalendarMonth(2026, 9, 'en')).toBe('Oct')
		expect(formatCalendarMonth(2026, 9, 'zh-CN', {
			month: 'long',
			year: 'numeric',
		})).toBe('2026年10月')
	})
})

describe('recorded instants', () => {
	it('treats missing and zero dates as unknown instead of inventing one', () => {
		expect(isUnknownInstant(undefined)).toBe(true)
		expect(isUnknownInstant(null)).toBe(true)
		expect(isUnknownInstant('')).toBe(true)
		expect(isUnknownInstant('0001-01-01T00:00:00Z')).toBe(true)
		expect(isUnknownInstant('0000-12-31T19:00:00-05:00')).toBe(true)
		expect(isUnknownInstant('garbage')).toBe(true)
		expect(isUnknownInstant('2026-10-31T09:30:00Z')).toBe(false)
		expect(formatInstantDate('0001-01-01T00:00:00Z', 'en', 'UTC')).toBeNull()
	})

	it('formats instants in the user time zone, not the browser one', () => {
		process.env.TZ = 'America/Los_Angeles'
		expect(formatInstantDate('2026-10-31T17:00:00Z', 'en', 'Asia/Shanghai')).toBe('Nov 1, 2026')
		expect(formatInstantDate('2026-10-31T17:00:00Z', 'en', 'UTC')).toBe('Oct 31, 2026')
	})
})

describe('heatmap levels', () => {
	it('keeps empty days at zero and any activity at level one or above', () => {
		expect(heatLevel(0, 5)).toBe(0)
		expect(heatLevel(-1, 5)).toBe(0)
		expect(heatLevel(Number.NaN, 5)).toBe(0)
		expect(heatLevel(1, 100)).toBe(1)
	})

	it('scales relative to the busiest day', () => {
		expect(heatLevel(1, 1)).toBe(4)
		expect(heatLevel(2, 8)).toBe(1)
		expect(heatLevel(3, 8)).toBe(2)
		expect(heatLevel(6, 8)).toBe(3)
		expect(heatLevel(8, 8)).toBe(4)
		expect(heatLevel(9, 8)).toBe(4)
		expect(heatLevel(3, 0)).toBe(4)
	})
})

describe('project history plural messages', () => {
	const i18n = createI18n({
		legacy: false,
		locale: 'en',
		messages: {
			en,
			'zh-CN': zh,
		},
	})
	const {t} = i18n.global

	it('pluralizes the statistics without "1 projects"', () => {
		expect(t('projectHistory.projectsCount', {n: 1}, 1)).toBe('1 project')
		expect(t('projectHistory.projectsCount', {n: 0}, 0)).toBe('0 projects')
		expect(t('projectHistory.projectsCount', {n: 3}, 3)).toBe('3 projects')
		expect(t('projectHistory.milestonesCount', {n: 1}, 1)).toBe('1 status change')
		expect(t('projectHistory.activeDays', {n: 2}, 2)).toBe('2 days with records')
		expect(t('projectHistory.recordsCount', {n: 1}, 1)).toBe('1 record')
	})

	it('reads day and month labels naturally', () => {
		const date = formatCalendarDay('2026-10-31', 'en')
		expect(t('projectHistory.dayLabel', {date, count: 0}, 0)).toBe('Oct 31, 2026: no status changes')
		expect(t('projectHistory.dayLabel', {date, count: 1}, 1)).toBe('Oct 31, 2026: 1 status change')
		expect(t('projectHistory.dayLabel', {date, count: 2}, 2)).toBe('Oct 31, 2026: 2 status changes')
		expect(t('projectHistory.monthLabel', {month: 'October 2026', count: 3}, 3))
			.toBe('October 2026: 3 status changes')
	})

	it('uses a single Chinese form for every count', () => {
		i18n.global.locale.value = 'zh-CN'
		expect(t('projectHistory.projectsCount', {n: 1}, 1)).toBe('1 个项目')
		expect(t('projectHistory.projectsCount', {n: 5}, 5)).toBe('5 个项目')
		const date = '2026年10月31日'
		expect(t('projectHistory.dayLabel', {date, count: 0}, 0)).toBe('2026年10月31日：0 次状态变化')
		expect(t('projectHistory.dayLabel', {date, count: 2}, 2)).toBe('2026年10月31日：2 次状态变化')
		i18n.global.locale.value = 'en'
	})
})
