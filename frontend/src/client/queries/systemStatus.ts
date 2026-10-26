import {queryOptions} from '@tanstack/vue-query'
import {systemStatus} from '@/client/generated'

export function systemStatusQuery(enabled: boolean) {
	return queryOptions({
		queryKey: ['system-status'],
		queryFn: async ({signal}) => (await systemStatus({signal})).data!,
		enabled,
		staleTime: 15000,
		refetchInterval: query => query.state.data?.host_metrics_available && query.state.data.cpu_percent == null ? 5000 : 30000,
		refetchIntervalInBackground: false,
		retry: false,
		meta: {handlesError: true},
	})
}
