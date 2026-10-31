import {describe, expect, it} from 'vitest'

import type {Task} from '@/client/generated'
import {
	draftValues,
	mergeServerDraft,
	sameDraftValue,
	settleSubmitted,
	unsavedDraftChanges,
} from './taskDraftMerge'

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 1,
		title: 'Plan',
		priority: 1,
		percent_done: 0.2,
		due_date: '2024-01-01T10:00:00Z',
		start_date: '',
		end_date: '',
		hex_color: '1973ff',
		repeat_after: 0,
		repeat_mode: 0,
		reminders: [{
			relative_to: 'due_date',
			relative_period: -3600,
			reminder: '2024-01-01T09:00:00Z',
		}],
		...overrides,
	}
}

describe('sameDraftValue', () => {
	it('compares what a value means, not how it is written', () => {
		expect(sameDraftValue('due_date', '2024-01-01T10:00:00Z', '2024-01-01T10:00:00.000Z')).toBe(true)
		expect(sameDraftValue('end_date', '', '0001-01-01T00:00:00Z')).toBe(true)
		expect(sameDraftValue('end_date', undefined, '')).toBe(true)
		expect(sameDraftValue('hex_color', '#1973FF', '1973ff')).toBe(true)
		expect(sameDraftValue('due_date', '2024-01-01T10:00:00Z', '2024-01-02T10:00:00Z')).toBe(false)
		expect(sameDraftValue('priority', 0, undefined)).toBe(true)
		expect(sameDraftValue('priority', 1, 2)).toBe(false)
	})

	it('identifies relative reminders by their period, not the date the server derived', () => {
		const relative = {relative_to: 'due_date', relative_period: -3600}
		expect(sameDraftValue('reminders', [{...relative, reminder: ''}], [{...relative, reminder: '2024-01-01T09:00:00Z'}])).toBe(true)
		expect(sameDraftValue('reminders', [{...relative, reminder: ''}], [{...relative, relative_period: -7200, reminder: ''}])).toBe(false)
	})
})

describe('mergeServerDraft', () => {
	it('takes server values for clean fields and keeps unsaved local edits', () => {
		const loaded = task()
		const baseline = draftValues(loaded)
		const local = {...loaded, due_date: '2024-02-02T10:00:00.000Z'}
		const server = task({
			due_date: '2024-03-03T10:00:00Z',
			start_date: '2024-02-20T10:00:00Z',
			priority: 4,
			percent_done: 0.8,
			hex_color: 'e8590c',
			title: 'Renamed',
		})

		expect(mergeServerDraft(local, baseline, server)).toMatchObject({
			due_date: '2024-02-02T10:00:00.000Z',
			start_date: '2024-02-20T10:00:00Z',
			priority: 4,
			percent_done: 0.8,
			hex_color: 'e8590c',
			title: 'Renamed',
		})
	})

	it('keeps the local object of a value the server did not change', () => {
		const loaded = task()
		const local = {...loaded}
		const merged = mergeServerDraft(local, draftValues(loaded), task({priority: 3}))

		expect(merged.reminders).toBe(local.reminders)
		expect(merged.priority).toBe(3)
	})
})

describe('unsavedDraftChanges and settleSubmitted', () => {
	it('lists only edited fields and stops treating them as edits once saved', () => {
		const loaded = task()
		const baseline = draftValues(loaded)
		const local = draftValues({...loaded, end_date: '', priority: 4, hex_color: '#1973ff'})

		expect(unsavedDraftChanges(local, baseline)).toEqual({priority: 4})

		const settled = settleSubmitted(local, baseline, {priority: 4})
		expect(unsavedDraftChanges(local, settled)).toEqual({})
	})

	it('keeps a field that changed again during its save as an edit', () => {
		const loaded = task()
		const baseline = draftValues(loaded)
		const local = draftValues({...loaded, priority: 5})

		const settled = settleSubmitted(local, baseline, {priority: 4})
		expect(unsavedDraftChanges(local, settled)).toEqual({priority: 5})
	})
})
