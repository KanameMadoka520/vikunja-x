import {queryOptions, useMutation} from '@tanstack/vue-query'
import {
	tcyAiSettings, tcyAiSaveSettings, tcyAiTest, tcyAiRun, tcyAiTranscribe, tcyAiCleanup,
	type TcyAiSaveSettingsData, type TcyAiTestData, type TcyAiRunData, type TcyAiTranscribeData,
} from '@/client/generated'
import {contextMutationOptions} from './contextMutation'
import {useSecretMutation} from './secretMutation'
import {projectKeys} from './projects'
import {taskKeys} from './tasks'

export type AIConnection = {id: string, name: string, base_url: string, model: string, kind: 'chat' | 'transcription', api_key: string, has_key: boolean}
export type AISettings = {connections: AIConnection[], assistant: string, transcription: string, cleanup: string}
export type AIRunResult = {reply: string, actions: {tool: string, arguments: string, result: string, success: boolean}[]}

const settingsKey = ['tcymc-ai', 'settings'] as const

export function aiSettingsQuery() {
	return queryOptions({queryKey: settingsKey, queryFn: async ({signal}): Promise<AISettings> => {
		const s = (await tcyAiSettings({signal})).data
		return {connections: (s.connections ?? []).map(c => ({id: c.id ?? '', name: c.name ?? '', base_url: c.base_url ?? '', model: c.model ?? '', kind: c.kind ?? 'chat', api_key: '', has_key: c.has_key ?? false})), assistant: s.assistant ?? '', transcription: s.transcription ?? '', cleanup: s.cleanup ?? ''}
	}})
}

export function useSaveAISettings() {
	return useSecretMutation(contextMutationOptions({
		mutationFn: async (body: TcyAiSaveSettingsData['body']) => (await tcyAiSaveSettings({body})).data,
		onSettled: (_input, client) => client.invalidateQueries({queryKey: settingsKey}),
		successMessage: () => '模型连接与功能分配已保存',
	}))
}

export function useTestAIConnection() {
	return useMutation(contextMutationOptions({
		mutationFn: async (body: TcyAiTestData['body']) => (await tcyAiTest({body})).data,
	}))
}

export function useRunAI() {
	return useMutation(contextMutationOptions({
		mutationFn: async (body: TcyAiRunData['body']): Promise<AIRunResult> => {
			const r = (await tcyAiRun({body})).data
			return {reply: r.reply ?? '', actions: (r.actions ?? []).map(a => ({tool: a.tool ?? '', arguments: a.arguments ?? '', result: a.result ?? '', success: a.success ?? false}))}
		},
		onSettled: (_input, client) => Promise.all([
			client.invalidateQueries({queryKey: taskKeys.all}),
			client.invalidateQueries({queryKey: projectKeys.all}),
		]),
	}))
}

export function useTranscribeAI() {
	return useMutation(contextMutationOptions({
		mutationFn: async (body: TcyAiTranscribeData['body']) => (await tcyAiTranscribe({body})).data,
	}))
}

export function useCleanupAI() {
	return useMutation(contextMutationOptions({
		mutationFn: async (text: string) => (await tcyAiCleanup({body: {text}})).data,
	}))
}
