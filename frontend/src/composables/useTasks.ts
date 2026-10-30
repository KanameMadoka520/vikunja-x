import {computed, toValue, type MaybeRefOrGetter} from 'vue'
import {hashKey, useQuery} from '@tanstack/vue-query'
import {tasksQuery, type TaskScope} from '@/client/queries/tasks'

export type UseTasksOptions = {
	enabled?: MaybeRefOrGetter<boolean>
	page?: MaybeRefOrGetter<number>
	// Set when the caller renders its own error state, so the global toast is skipped.
	handlesError?: boolean
	// Keep the shown page while another page of the same list loads, so pagination
	// controls stay mounted and focused.
	keepPreviousPage?: boolean
}

// A different scope starts without data so stale rows never pass for the new filter.
function keepPageOfSameScope(queryKey: readonly unknown[]) {
	const scopeHash = hashKey(queryKey.slice(0, -1))
	return <T>(previous: T | undefined, previousQuery?: {queryKey: readonly unknown[]}) =>
		previousQuery && hashKey(previousQuery.queryKey.slice(0, -1)) === scopeHash ? previous : undefined
}

export function useTasks(
	scope: MaybeRefOrGetter<TaskScope>,
	{
		enabled = true,
		page = 1,
		handlesError = false,
		keepPreviousPage = false,
	}: UseTasksOptions = {},
) {
	const query = useQuery(computed(() => {
		const options = tasksQuery(toValue(scope), toValue(page))
		return {
			...options,
			enabled: toValue(enabled),
			...(handlesError ? {meta: {handlesError: true}} : {}),
			...(keepPreviousPage ? {placeholderData: keepPageOfSameScope(options.queryKey)} : {}),
		}
	}))
	const tasks = computed(() => query.data.value?.items ?? [])
	const total = computed(() => query.data.value?.total ?? 0)
	const totalPages = computed(() => query.data.value?.total_pages ?? 0)
	return {...query, tasks, total, totalPages}
}
