import {queryOptions, useQueryClient} from '@tanstack/vue-query'
import {barkSettings, barkSave, barkTest, type BarkSaveData} from '@/client/generated'
import {contextMutationOptions} from './contextMutation'
import {useSecretMutation} from './secretMutation'
import {i18n} from '@/i18n'
const key = ['personal-bark'] as const
export function barkQuery() {
	return queryOptions({queryKey: key, queryFn: async ({signal}) => (await barkSettings({signal})).data, refetchInterval: 10000})
}
export function useSaveBark() {
	const client = useQueryClient()
	return useSecretMutation(contextMutationOptions({
		mutationFn: async (body: BarkSaveData['body']) => {await client.cancelQueries({queryKey: key}); return (await barkSave({body})).data},
		onSuccess: data => {client.setQueryData(key, data)},
		successMessage: () => i18n.global.t('bark.saved'),
	}))
}
export function useTestBark() {
	const client = useQueryClient()
	return useSecretMutation(contextMutationOptions({
		mutationFn: async () => (await barkTest()).data,
		onSuccess: data => {client.setQueryData(key, data)},
	}))
}
