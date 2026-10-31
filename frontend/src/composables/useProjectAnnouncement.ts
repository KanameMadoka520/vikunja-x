import {computed, toValue, type MaybeRefOrGetter} from 'vue'
import {useQuery} from '@tanstack/vue-query'

import {projectAnnouncementQuery} from '@/client/queries/projectAnnouncements'

// Pseudo projects (Favorites, saved filters) have no announcement, so ids <= 0 never read one.
export function useProjectAnnouncement(projectId: MaybeRefOrGetter<number>) {
	const query = useQuery(computed(() => ({
		...projectAnnouncementQuery(toValue(projectId)),
		enabled: toValue(projectId) > 0,
	})))

	return {
		announcement: computed(() => query.data.value ?? null),
		isPending: query.isPending,
		// For the editor after a 409: the latest version, read through the same query.
		refetch: query.refetch,
	}
}
