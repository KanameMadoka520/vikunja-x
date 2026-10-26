import {watch, ref, onScopeDispose, type Ref} from 'vue'
import {useQueryClient} from '@tanstack/vue-query'
import {tcyAiConversationsEvents, type Conversation, type ChatTurn} from '@/client/generated'
import {assertClientRequestContext, captureClientRequestContext} from '@/client/requestContext'
import {conversationKeys} from './tcyConversations'

type Activity = Pick<Conversation, 'compact_progress' | 'compacting' | 'compact_text' | 'compact_error' | 'compactions'> & {turn?: ChatTurn}
export function useConversationEvents(id: Ref<string>) {
	const client = useQueryClient()
	const connected = ref(false)
	let controller: AbortController | undefined
	watch(id, value => {
		controller?.abort()
		connected.value = false
		if (!value) return
		controller = new AbortController()
		void observe(value, controller.signal)
	}, {immediate: true})
	onScopeDispose(() => controller?.abort())

	async function observe(value: string, signal: AbortSignal) {
		const context = captureClientRequestContext()
		while (!signal.aborted) {
			try {
				assertClientRequestContext(context)
				const response = await tcyAiConversationsEvents({path: {id: value}, signal, parseAs: 'stream'})
				const stream = response.data as ReadableStream<Uint8Array>
				if (!stream?.getReader) return
				const reader = stream.getReader()
				const decoder = new TextDecoder()
				let buffer = ''
				try {
					while (!signal.aborted) {
						const {value: bytes, done} = await reader.read()
						if (done) break
						assertClientRequestContext(context)
						connected.value = true
						buffer += decoder.decode(bytes, {stream: true}).replace(/\r\n/g, '\n')
						if (buffer.length > 20 * 1024 * 1024) throw new Error('Event frame too large')
						let end: number
						while ((end = buffer.indexOf('\n\n')) >= 0) {
							const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2)
							const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
							if (!data) continue
							const activity = JSON.parse(data) as Activity
							client.setQueryData<Conversation>(conversationKeys.detail(value), current => current ? {
								...current, ...activity, compact_progress: activity.compact_progress, compact_text: activity.compact_text ?? '', compact_error: activity.compact_error ?? '', turns: activity.turn ? [...(current.turns ?? []).filter(turn => turn.id !== activity.turn!.id), activity.turn] : current.turns,
							} : current)
						}
					}
				} finally { await reader.cancel().catch(() => undefined) }
			} catch {
				if (signal.aborted) return
				try { assertClientRequestContext(context) } catch { return }
			}
			connected.value = false
			await new Promise<void>(resolve => {
				const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
				const timer = setTimeout(done, 1500)
				signal.addEventListener('abort', done, {once: true})
			})
		}
	}
	return {connected}
}
