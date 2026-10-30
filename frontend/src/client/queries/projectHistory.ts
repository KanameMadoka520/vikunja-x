import {queryOptions, useMutation} from '@tanstack/vue-query'
import {projectHistory, projectCompletion, type ProjectHistoryData} from '@/client/generated'
import {contextMutationOptions} from './contextMutation'
import {projectKeys} from './projects'

export function projectHistoryQuery(query: NonNullable<ProjectHistoryData['query']>) {
	return queryOptions({
		queryKey: ['project-history', query],
		queryFn: async ({signal}) => (await projectHistory({query, signal})).data!,
		staleTime: 0,
		placeholderData: (previous, previousQuery) => {
			const old = previousQuery?.queryKey[1] as typeof query | undefined
			return old && ['year', 'timezone', 'project', 'kind', 'q'].every(key => old[key as keyof typeof query] === query[key as keyof typeof query]) ? previous : undefined
		},
		meta: {handlesError: true},
	})
}
export function useProjectCompletionMutation() {
	return useMutation(contextMutationOptions({
		mutationFn: async ({id, completed}: {id: number, completed: boolean}) =>
   (await projectCompletion({path: {project: id}, body: {completed}})).data!,
		onSettled: ({id}, client) => Promise.all([
			client.invalidateQueries({queryKey: projectKeys.list()}),
			client.invalidateQueries({queryKey: projectKeys.detail(id)}),
			client.invalidateQueries({queryKey: ['project-history']}),
		]),
	}))
}
