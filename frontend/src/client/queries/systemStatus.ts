import {queryOptions} from '@tanstack/vue-query'
import {systemStatus} from '@/client/generated'

export function systemStatusQuery(enabled: boolean) {
	return queryOptions({
		queryKey: ['system-status'],
		queryFn: async ({signal}) => (await systemStatus({signal})).data!,
		enabled,
		staleTime: 5000,
		refetchInterval: 5000,
		refetchIntervalInBackground: false,
		retry: false,
		meta: {handlesError: true},
	})
}
