import {queryOptions, useMutation} from '@tanstack/vue-query'
import {tcyAiPreferences, tcyAiSavePreferences, type AssistantPreferences} from '@/client/generated'
import {contextMutationOptions} from './contextMutation'
const key = ['tcymc-ai-preferences'] as const
export function assistantPreferencesQuery() {
	return queryOptions({queryKey: key, queryFn: async ({signal}) => (await tcyAiPreferences({signal})).data})
}
export function useSaveAssistantPreferences() {
	return useMutation(contextMutationOptions({
		mutationFn: async (body: AssistantPreferences) => (await tcyAiSavePreferences({body})).data,
		onSettled: (_input, client) => client.invalidateQueries({queryKey: key}),
	}))
}
