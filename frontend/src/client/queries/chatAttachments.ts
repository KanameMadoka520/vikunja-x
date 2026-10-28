import {queryOptions, useMutation} from '@tanstack/vue-query'
import {tcyAiAttachmentsUpload, tcyAiAttachmentsRemove, tcyAiAttachmentsDownload, tcyAiConversationsExport} from '@/client/generated'
import {contextMutationOptions} from './contextMutation'
import {conversationKeys} from './tcyConversations'

export async function fetchChatAttachment(id: string, file: string, signal?: AbortSignal): Promise<Blob> {
	const data: unknown = (await tcyAiAttachmentsDownload({path: {id, file}, parseAs: 'blob', signal})).data
	if (!(data instanceof Blob)) throw new Error('Invalid attachment response')
	return data
}
export function chatAttachmentQuery(id: string, file: string, enabled: boolean) {
	return queryOptions({queryKey: [...conversationKeys.detail(id), 'attachment', file], queryFn: ({signal}) => fetchChatAttachment(id, file, signal), enabled, retry: false, gcTime: 60_000, staleTime: Infinity, meta: {handlesError: true}})
}
export function useUploadChatAttachment() {
	return useMutation(contextMutationOptions({
		mutationFn: async ({id, file, signal}: {id: string, file: File, signal?: AbortSignal}) => (await tcyAiAttachmentsUpload({path: {id}, body: {file}, signal})).data,
		onSettled: ({id}, client) => Promise.all([client.invalidateQueries({queryKey: conversationKeys.detail(id)}), client.invalidateQueries({queryKey: conversationKeys.lists()})]),
	}))
}
export function useRemoveChatAttachment() {
	return useMutation(contextMutationOptions({
		mutationFn: async ({id, file}: {id: string, file: string}) => (await tcyAiAttachmentsRemove({path: {id, file}})).data,
		onSettled: ({id}, client) => client.invalidateQueries({queryKey: conversationKeys.detail(id)}),
	}))
}
export async function fetchConversationExport(id: string, format: 'json' | 'md' | 'zip', signal?: AbortSignal): Promise<Blob> {
	const data: unknown = (await tcyAiConversationsExport({path: {id}, query: {format}, parseAs: 'blob', signal})).data
	if (!(data instanceof Blob)) throw new Error('Invalid export response')
	return data
}
