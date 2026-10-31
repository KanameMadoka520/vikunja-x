import {computed, toValue, type MaybeRefOrGetter} from 'vue'
import {useQuery} from '@tanstack/vue-query'

import {taskRoutineHistoryQuery, taskRoutineQuery} from '@/client/queries/taskRoutines'

// Read side only; writes go through the mutations in client/queries/taskRoutines.ts.
export function useTaskRoutineSummary(taskId: MaybeRefOrGetter<number>) {
	const query = useQuery(computed(() => ({
		...taskRoutineQuery(toValue(taskId)),
		enabled: toValue(taskId) > 0,
	})))
	return {
		routine: computed(() => query.data.value),
		isPending: computed(() => query.isPending.value),
		error: computed(() => query.error.value),
		refetch: query.refetch,
	}
}

export function useTaskRoutineHistory(
	taskId: MaybeRefOrGetter<number>,
	year: MaybeRefOrGetter<number>,
	month: MaybeRefOrGetter<number>,
) {
	const query = useQuery(computed(() => ({
		...taskRoutineHistoryQuery(toValue(taskId), toValue(year), toValue(month)),
		enabled: toValue(taskId) > 0 && toValue(year) > 0 && toValue(month) > 0,
	})))
	return {
		history: computed(() => query.data.value),
		isPending: computed(() => query.isPending.value),
		error: computed(() => query.error.value),
		refetch: query.refetch,
	}
}
