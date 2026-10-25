import {queryOptions, useMutation, keepPreviousData} from '@tanstack/vue-query'
import {
	tcyAiConversationsList,
	tcyAiConversationsCreate,
	tcyAiConversationsRead,
	tcyAiConversationsRename,
	tcyAiConversationsDelete,
	tcyAiConversationsSend,
	tcyAiConversationsStop,
	tcyAiConversationsFork,
	tcyAiConversationsCompact,
	tcyAiPrompt,
	type Conversation,
	type TcyAiConversationsSendData,
} from '@/client/generated'
import {contextMutationOptions} from './contextMutation'
import {taskKeys} from './tasks'
import {projectKeys} from './projects'

export const conversationKeys = {
	all: ['tcymc-conversations'] as const,
	lists: () => [...conversationKeys.all, 'list'] as const,
	list: (page: number) => [...conversationKeys.lists(), page] as const,
	detail: (id: string) => [...conversationKeys.all, 'detail', id] as const,
}

export function conversationsQuery(page: number) {
	return queryOptions({
		queryKey: conversationKeys.list(page),
		queryFn: async ({signal}) => (await tcyAiConversationsList({query: {page}, signal})).data,
		placeholderData: keepPreviousData,
		refetchInterval: 3000,
	})
}

export function conversationQuery(id: string) {
	return queryOptions({
		queryKey: conversationKeys.detail(id),
		queryFn: async ({signal}) => (await tcyAiConversationsRead({path: {id}, signal})).data,
		enabled: Boolean(id),
		meta: {handlesError: true},
		refetchInterval: query => query.state.data?.turns?.some(turn => turn.status === 'running') ? 500 : false,
	})
}

export function promptQuery(projectId: number, mode: 'read' | 'write', allowDelete: boolean, enabled: boolean) {
	return queryOptions({
		queryKey: ['tcymc-ai-prompt', projectId, mode, allowDelete],
		queryFn: async ({signal}) => (await tcyAiPrompt({query: {
			project_id: projectId,
			mode,
			allow_delete: allowDelete,
		}, signal})).data,
		enabled,
	})
}

export function useCreateConversation() {
	return useMutation(contextMutationOptions({
		mutationFn: async () => (await tcyAiConversationsCreate({body: {title: ''}})).data,
		onSettled: (_, client) => client.invalidateQueries({queryKey: conversationKeys.lists()}),
	}))
}

export function useConversationAction() {
	type Input = {
		id: string
		action: 'rename' | 'delete' | 'stop' | 'fork' | 'compact'
		title?: string
		turnId?: string
		connectionId?: string
	}
	return useMutation(contextMutationOptions({
		mutationFn: async (input: Input): Promise<Conversation | undefined> => {
			const path = {id: input.id}
			switch (input.action) {
				case 'rename': return (await tcyAiConversationsRename({path, body: {title: input.title ?? ''}})).data
				case 'delete': await tcyAiConversationsDelete({path}); return
				case 'stop': await tcyAiConversationsStop({path}); return
				case 'fork': return (await tcyAiConversationsFork({path, body: {turn_id: input.turnId!}})).data
				case 'compact': return (await tcyAiConversationsCompact({path, body: {connection_id: input.connectionId ?? ''}})).data
			}
		},
		onSettled: (input, client) => Promise.all([
			client.invalidateQueries({queryKey: conversationKeys.lists()}),
			client.invalidateQueries({queryKey: conversationKeys.detail(input.id)}),
		]),
	}))
}

export function useSendConversation() {
	return useMutation(contextMutationOptions({
		mutationFn: async (input: {
			id: string
			body: TcyAiConversationsSendData['body']
		}) => (await tcyAiConversationsSend({path: {id: input.id}, body: input.body})).data,
		onSuccess: (data, input, client) => client.setQueryData(conversationKeys.detail(input.id), data),
		onSettled: (input, client) => Promise.all([
			client.invalidateQueries({queryKey: conversationKeys.detail(input.id)}),
			client.invalidateQueries({queryKey: conversationKeys.lists()}),
		]),
	}))
}

// Completion also invalidates task data after a resumed run or a run started in another tab.
export function useRefreshAgentChanges() {
	return useMutation(contextMutationOptions({
		mutationFn: async () => undefined,
		onSettled: (_, client) => Promise.all([
			client.invalidateQueries({queryKey: taskKeys.all}),
			client.invalidateQueries({queryKey: projectKeys.all}),
			client.invalidateQueries({queryKey: conversationKeys.lists()}),
		]),
	}))
}
