import {queryOptions, useQueryClient} from '@tanstack/vue-query'
import {systemSettingsAccess, systemMailSettings, systemSaveMailSettings, type MailSettingsWritable} from '@/client/generated'
import {contextMutationOptions} from './contextMutation'
import {useSecretMutation} from './secretMutation'
import {i18n} from '@/i18n'
const key = ['tcymc-site-settings', 'mail'] as const
export function mailSettingsAccessQuery() {
	return queryOptions({queryKey: ['tcymc-site-settings', 'access'], queryFn: async ({signal}) => (await systemSettingsAccess({signal})).data})
}
export function mailSettingsQuery() {
	return queryOptions({queryKey: key, queryFn: async ({signal}) => (await systemMailSettings({signal})).data})
}
export function useSaveMailSettings() {
	const client = useQueryClient()
	return useSecretMutation(contextMutationOptions({
		mutationFn: async (body: MailSettingsWritable) => {
			await client.cancelQueries({queryKey: key})
			return (await systemSaveMailSettings({body})).data
		},
		onSuccess: data => { client.setQueryData(key, data) },
		successMessage: () => i18n.global.t('mailServer.saved'),
	}))
}
