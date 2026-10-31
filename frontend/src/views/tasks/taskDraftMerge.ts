import {klona} from 'klona/lite'

import type {Task, TaskReminder} from '@/client/generated'
import {colorFromHex} from '@/helpers/color/colorFromHex'
import {parseDateOrNull} from '@/helpers/parseDateOrNull'

/**
 * Fields the task detail edits in place before saving them. Title and description keep their own
 * drafts in Heading and Description; everything else always shows the cached task.
 */
export const DRAFT_FIELDS = [
	'priority',
	'percent_done',
	'due_date',
	'start_date',
	'end_date',
	'reminders',
	'repeat_after',
	'repeat_mode',
	'hex_color',
] as const

export type DraftField = typeof DRAFT_FIELDS[number]
export type DraftValues = Pick<Task, DraftField>

export function draftValues(task: Task): DraftValues {
	return klona(Object.fromEntries(DRAFT_FIELDS.map(field => [field, task[field]]))) as DraftValues
}

const dateValue = (value: unknown) => parseDateOrNull(value as string | null | undefined)?.getTime() ?? null

const colorValue = (value: unknown) => colorFromHex(typeof value === 'string' ? value : '').toLowerCase()

function reminderValues(value: unknown) {
	return ((value ?? []) as TaskReminder[]).map(reminder => ({
		// The server derives the date of a relative reminder, so only its period identifies it.
		reminder: reminder.relative_to ? null : dateValue(reminder.reminder),
		relative_period: reminder.relative_period ?? 0,
		relative_to: reminder.relative_to ?? '',
	}))
}

/** Whether two values of a field mean the same thing, so formatting differences never count as an edit. */
export function sameDraftValue(field: DraftField, a: unknown, b: unknown): boolean {
	switch (field) {
		case 'due_date':
		case 'start_date':
		case 'end_date':
			return dateValue(a) === dateValue(b)
		case 'hex_color':
			return colorValue(a) === colorValue(b)
		case 'reminders':
			return JSON.stringify(reminderValues(a)) === JSON.stringify(reminderValues(b))
		default:
			return (a ?? 0) === (b ?? 0)
	}
}

/** Local edits that differ from the server values they started from. */
export function unsavedDraftChanges(local: DraftValues, baseline: DraftValues): Partial<DraftValues> {
	return Object.fromEntries(DRAFT_FIELDS
		.filter(field => !sameDraftValue(field, local[field], baseline[field]))
		.map(field => [field, klona(local[field])])) as Partial<DraftValues>
}

/** The value a field shows after a server update: an unsaved local edit wins, otherwise the server's. */
export function followServerValue<F extends DraftField>(
	field: F,
	local: DraftValues[F],
	baseline: DraftValues[F],
	server: DraftValues[F],
): DraftValues[F] {
	return sameDraftValue(field, local, baseline) ? server : local
}

/**
 * A server copy of the task applied to the local draft: clean fields take the server value, unsaved edits stay.
 * An unchanged value keeps its local object, so children watching it (an open reminder popup) keep their state.
 */
export function mergeServerDraft<T extends Task>(local: T, baseline: DraftValues, server: T): T {
	const merged: T = {...server}
	const fields: DraftValues = merged
	for (const field of DRAFT_FIELDS) {
		fields[field] = (JSON.stringify(local[field]) === JSON.stringify(server[field])
			? local[field]
			: followServerValue(field, local[field], baseline[field], server[field])) as never
	}
	return merged
}

/** After a save, fields that still hold the submitted value are no longer local edits. */
export function settleSubmitted(local: DraftValues, baseline: DraftValues, submitted: Partial<Task>): DraftValues {
	const settled = {...baseline}
	for (const field of DRAFT_FIELDS) {
		if (field in submitted && sameDraftValue(field, local[field], submitted[field])) {
			settled[field] = klona(local[field]) as never
		}
	}
	return settled
}
