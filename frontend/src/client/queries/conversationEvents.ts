import {watch, ref, onScopeDispose, toValue, type MaybeRefOrGetter} from 'vue'
import {useQueryClient} from '@tanstack/vue-query'
import {tcyAiConversationsEvents, type Conversation, type ChatTurn} from '@/client/generated'
import {assertClientRequestContext, captureClientRequestContext} from '@/client/requestContext'
import {conversationKeys} from './tcyConversations'

type Activity = Pick<Conversation, 'compact_progress' | 'compacting' | 'compact_text' | 'compact_error' | 'compactions'> & {turn?: ChatTurn}

// The server ends every event stream after 25 seconds; a stream that stayed open this long was healthy.
export const HEALTHY_STREAM_MS = 10_000
export const RETRY_MS = 1500
export const MAX_RETRY_MS = 30_000
// The server sends the current state right away, so a reconnect that stays silent this long is not live.
export const SILENT_STREAM_MS = 3000

// Keeps the turn's position: earlier turns can still change (review, retry) without reordering the thread.
function replaceTurn(turns: readonly ChatTurn[], turn: ChatTurn): ChatTurn[] {
	return turns.some(item => item.id === turn.id)
		? turns.map(item => item.id === turn.id ? turn : item)
		: [...turns, turn]
}

function wait(ms: number, signal: AbortSignal) {
	return new Promise<void>(resolve => {
		const done = () => {
			clearTimeout(timer)
			signal.removeEventListener('abort', done)
			resolve()
		}
		const timer = setTimeout(done, ms)
		signal.addEventListener('abort', done, {once: true})
	})
}

/**
 * Streams live activity of a conversation into its detail cache. `connected` stays true across the
 * immediate reconnect after a healthy stream, so callers skip their polling fallback; it turns false
 * while reconnecting after a failed, empty or short stream, which backs off instead of looping.
 */
export function useConversationEvents(id: MaybeRefOrGetter<string>) {
	const client = useQueryClient()
	const connected = ref(false)
	let controller: AbortController | undefined
	watch(() => toValue(id), value => {
		controller?.abort()
		connected.value = false
		if (!value) return
		controller = new AbortController()
		void observe(value, controller.signal)
	}, {immediate: true})
	onScopeDispose(() => controller?.abort())

	async function observe(value: string, signal: AbortSignal) {
		const context = captureClientRequestContext()
		let failures = 0
		while (!signal.aborted) {
			const started = Date.now()
			let received = false
			let failed = false
			const silent = setTimeout(() => {
				if (!received) connected.value = false
			}, SILENT_STREAM_MS)
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
						buffer += decoder.decode(bytes, {stream: true}).replace(/\r\n/g, '\n')
						if (buffer.length > 20 * 1024 * 1024) throw new Error('Event frame too large')
						let end: number
						while ((end = buffer.indexOf('\n\n')) >= 0) {
							const frame = buffer.slice(0, end)
							buffer = buffer.slice(end + 2)
							const data = frame.split('\n')
								.filter(line => line.startsWith('data:'))
								.map(line => line.slice(5).trimStart())
								.join('\n')
							if (!data) continue
							const {turn, ...activity} = JSON.parse(data) as Activity
							received = true
							connected.value = true
							client.setQueryData<Conversation>(conversationKeys.detail(value), current => current ? {
								...current,
								...activity,
								compact_progress: activity.compact_progress,
								compact_text: activity.compact_text ?? '',
								compact_error: activity.compact_error ?? '',
								turns: turn ? replaceTurn(current.turns ?? [], turn) : current.turns,
							} : current)
						}
					}
				} finally {
					await reader.cancel().catch(() => undefined)
				}
			} catch {
				if (signal.aborted) return
				try {
					assertClientRequestContext(context)
				} catch {
					return
				}
				failed = true
			} finally {
				clearTimeout(silent)
			}
			if (signal.aborted) return
			// A clean end after a long stream is the server's regular cut: reconnect at once, still live.
			if (!failed && Date.now() - started >= HEALTHY_STREAM_MS) {
				failures = 0
				continue
			}
			connected.value = false
			// A short stream that delivered state is the old steady cadence; an empty or failed one backs off.
			failures = received && !failed ? 0 : failures + 1
			await wait(Math.min(RETRY_MS * 2 ** Math.max(0, failures - 1), MAX_RETRY_MS), signal)
		}
	}
	return {connected}
}
