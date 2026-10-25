<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const {t} = useI18n({useScope: 'global'})
import {audioChatFile} from '@/helpers/tcyAudio'
import {computed, onBeforeUnmount, ref, watch, nextTick} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {aiSettingsQuery, useCleanupAI, useTranscribeAI} from '@/client/queries/tcyAi'
import ChatTurnCard from '@/components/ai/ChatTurnCard.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import {
	conversationsQuery,
	conversationQuery,
	promptQuery,
	useCreateConversation,
	useConversationAction,
	useSendConversation,
	useRefreshAgentChanges,
} from '@/client/queries/tcyConversations'
import {useProjects} from '@/composables/useProjects'
import {useTitle} from '@/composables/useTitle'
import {isRequestContextAbort} from '@/client/requestContext'

useTitle(() => t('tcymc.text.ai_task_assistant'))
const route = useRoute()
const projectID = ref(Number(route.query.project) || 0)
const {projectsArray} = useProjects()
const settings = useQuery(aiSettingsQuery())
const router = useRouter()
const create = useCreateConversation()
const action = useConversationAction()
const send = useSendConversation()
const refreshChanges = useRefreshAgentChanges()
const listPage = ref(1)
const sessions = useQuery(computed(() => conversationsQuery(listPage.value)))
const chatID = computed(() => typeof route.query.chat === 'string' ? route.query.chat : '')
const current = useQuery(computed(() => conversationQuery(chatID.value)))
const active = computed(() => current.data.value)
const activeRun = computed(() => active.value?.turns?.some(turn => turn.status === 'running') ?? false)
const sidebarOpen = ref(false)
const connectionID = ref('')
const chatModels = computed(() => settings.data.value?.connections.filter(c => c.kind === 'chat') ?? [])
const selectedConnection = computed(() => connectionID.value || settings.data.value?.assistant || '')
const rename = ref(false)
const newTitle = ref('')
const showSystemPrompt = ref(false)
const thread = ref<HTMLElement>()
const stickToBottom = ref(true)
const drafts = new Map<string, string>()
const transcribe = useTranscribeAI()
const cleanup = useCleanupAI()
const prompt = ref('')
const mode = ref<'read' | 'write'>('read')
const allowDelete = ref(false)
const effectivePrompt = useQuery(computed(() => promptQuery(projectID.value, mode.value, allowDelete.value, showSystemPrompt.value)))
const tidy = ref(true)
const original = ref('')
const notice = ref('')
const audioInput = ref<HTMLInputElement>()
const recording = ref(false)
const elapsed = ref(0)
const editingBusy = computed(() => create.isPending.value || send.isPending.value || action.isPending.value || transcribe.isPending.value || cleanup.isPending.value || recording.value)
const busy = computed(() => editingBusy.value || activeRun.value)
const hasAssistant = computed(() => Boolean(selectedConnection.value))
const hasSpeech = computed(() => Boolean(settings.data.value?.transcription))
let recorder: MediaRecorder | undefined
let stream: MediaStream | undefined
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false

async function selectConversation(id: string) {
	if (editingBusy.value) return
	drafts.set(chatID.value, prompt.value)
	await router.replace({name: 'tcy-ai', query: {...route.query, chat: id}})
	prompt.value = drafts.get(id) ?? ''
	original.value = ''
	sidebarOpen.value = false
	stickToBottom.value = true
}

async function newConversation() {
	if (editingBusy.value) return
	try {
		const location = route.fullPath
		const conversation = await create.mutateAsync()
		if (route.name !== 'tcy-ai' || route.fullPath !== location) return
		await selectConversation(conversation.id!)
	} catch { return }
}

async function submit() {
	if (!prompt.value.trim() || busy.value || !hasAssistant.value) return
	const message = prompt.value.trim()
	const id = chatID.value
	const location = route.fullPath
	const request = {
		message,
		history: [],
		project_id: projectID.value,
		mode: mode.value,
		allow_delete: allowDelete.value && mode.value === 'write',
		request_id: crypto.randomUUID(),
		connection_id: selectedConnection.value,
	}
	try {
		let target = id
		if (!target) {
			const created = await create.mutateAsync()
			target = created.id!
			if (route.name !== 'tcy-ai' || route.fullPath !== location) return
			await router.replace({name: 'tcy-ai', query: {...route.query, chat: target}})
		}
		await send.mutateAsync({id: target, body: request})
		if (chatID.value === target && prompt.value.trim() === message) {
			prompt.value = ''
			drafts.delete(target)
			original.value = ''
			stickToBottom.value = true
		}
	} catch (e) {
		if (isRequestContextAbort(e)) return
		notice.value = t('chat.sendFailed')
	}
}

async function manage(kind: 'rename' | 'delete' | 'stop' | 'compact' | 'fork', turnId?: string) {
	if (!chatID.value || action.isPending.value) return
	if (kind === 'rename' && (!newTitle.value.trim() || busy.value)) return
	if (kind === 'delete' && !window.confirm(t('chat.deleteConfirm'))) return
	if (kind === 'fork' && !window.confirm(t('chat.forkConfirm'))) return
	if (kind === 'compact' && !window.confirm(t('chat.compactConfirm'))) return
	const id = chatID.value
	try {
		const result = await action.mutateAsync({
			id,
			action: kind,
			title: newTitle.value.trim(),
			turnId,
			connectionId: selectedConnection.value,
		})
		if (route.name !== 'tcy-ai' || chatID.value !== id) return
		rename.value = false
		if (kind === 'fork' && result?.id) await selectConversation(result.id)
		if (kind === 'delete') {
			prompt.value = ''
			await router.replace({name: 'tcy-ai', query: {project: route.query.project}})
		}
	} catch { return }
}

function composerKeydown(event: KeyboardEvent) {
	if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
		event.preventDefault()
		void submit()
	}
}

watch(() => active.value?.turns?.at(-1)?.status, (status, previous) => {
	if (previous === 'running' && status !== 'running') refreshChanges.mutate()
})
watch(() => JSON.stringify(active.value?.turns?.at(-1)?.result), async () => {
	await nextTick()
	if (stickToBottom.value && thread.value) thread.value.scrollTop = thread.value.scrollHeight
})

async function processAudio(file: Blob, filename: string) {
	if (file.size > 16 * 1024 * 1024) { notice.value = t('tcymc.text.audio_must_not_exceed_16_mib'); return }
	if (!file.size) { notice.value = t('tcymc.text.the_recording_is_empty_please_try_again'); return }
	notice.value = ''
	const connection = settings.data.value?.connections.find(c => c.id === settings.data.value?.transcription)
	if (connection?.protocol === 'openai-audio') {
		try { const converted = await audioChatFile(file, filename); file = converted.file; filename = converted.filename }
		catch { notice.value = t('tcymc.audioConversionFailed'); return }
	}
	try {
		const audio = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(String(reader.result).split(',')[1])
			reader.onerror = reject
			reader.readAsDataURL(file)
		})
		const result = await transcribe.mutateAsync({audio, filename, cleanup: tidy.value})
		if (disposed) return
		original.value = result.original ?? ''
		prompt.value = [prompt.value, result.text].filter(Boolean).join('\n')
		notice.value = result.warning || t('tcymc.text.transcription_complete_edit_the_text_if_needed_then')
	} catch (e) { if (isRequestContextAbort(e)) return; notice.value = t('tcymc.text.speech_recognition_failed_check_the_model_settings_or') }
}

function stopTracks() {
	stream?.getTracks().forEach(track => track.stop())
	if (timer) clearInterval(timer)
}

async function toggleRecording() {
	if (busy.value && !recording.value) return
	if (!hasSpeech.value) return
	if (recording.value) { recorder?.stop(); return }
	if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
		notice.value = t('tcymc.text.this_browser_cannot_record_audio_please_upload_an'); return
	}
	try {
		stream = await navigator.mediaDevices.getUserMedia({audio: true})
		if (disposed) { stopTracks(); return }
		const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
		recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined)
		const chunks: Blob[] = []
		recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
		recorder.onstop = () => {
			recording.value = false
			stopTracks()
			if (!disposed) void processAudio(new Blob(chunks, {type: recorder?.mimeType}), mimeType?.includes('mp4') ? 'recording.m4a' : 'recording.webm')
		}
		recorder.onerror = () => { recording.value = false; stopTracks(); notice.value = t('tcymc.text.recording_was_interrupted_please_try_again') }
		recorder.start(1000)
		recording.value = true
		elapsed.value = 0
		timer = setInterval(() => { elapsed.value++; if (elapsed.value >= 180 && recorder?.state === 'recording') recorder.stop() }, 1000)
	} catch { stopTracks(); notice.value = t('tcymc.text.cannot_access_the_microphone_check_your_browser_s') }
}

async function upload(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (file) await processAudio(file, file.name)
	input.value = ''
}

async function tidyText() {
	if (busy.value || !prompt.value.trim() || !settings.data.value?.cleanup) return
	try {
		const result = await cleanup.mutateAsync(prompt.value)
		original.value = result.original ?? ''
		prompt.value = result.text ?? ''
	} catch { return }
}

onBeforeUnmount(() => {
	disposed = true
	if (recorder?.state === 'recording') recorder.stop()
	stopTracks()
})
</script>

<template>
	<div class="tcy-assistant">
		<header class="assistant-heading">
			<div>
				<p class="eyebrow">
					{{ t('tcymc.assistantEyebrow') }}
				</p><h1><Icon icon="robot" /> {{ t('tcymc.text.ai_task_assistant') }}</h1>
			</div>
			<div class="heading-actions">
				<XButton
					variant="secondary"
					icon="history"
					:aria-expanded="sidebarOpen"
					@click="sidebarOpen = !sidebarOpen"
				>
					{{ t('chat.conversations') }}
				</XButton><XButton
					variant="secondary"
					icon="cog"
					:to="{name: 'user.settings.ai'}"
				>
					{{ t('tcymc.text.ai_and_voice_settings') }}
				</XButton>
			</div>
		</header>
		<div class="chat-shell">
			<aside
				class="chat-sidebar"
				:class="{'is-open': sidebarOpen}"
				:aria-label="t('chat.conversations')"
			>
				<XButton
					variant="primary"
					icon="plus"
					:aria-disabled="editingBusy"
					@click="newConversation"
				>
					{{ t('chat.new') }}
				</XButton>
				<p v-if="sessions.isPending.value">
					{{ t('misc.loading') }}
				</p><p
					v-else-if="!sessions.data.value?.items?.length"
					class="muted"
				>
					{{ t('chat.noConversations') }}
				</p>
				<ul>
					<li
						v-for="session in sessions.data.value?.items"
						:key="session.id"
					>
						<BaseButton
							class="session-link"
							:class="{'is-selected': session.id === chatID}"
							:aria-current="session.id === chatID ? 'page' : undefined"
							:aria-disabled="editingBusy"
							@click="selectConversation(session.id!)"
						>
							<Icon :icon="session.parent_id ? 'code-branch' : ['far', 'comments']" /><span><strong>{{ session.title || t('chat.untitled') }}</strong><small>{{ t('chat.turnCount', {count: session.turn_count ?? 0}) }}<span v-if="session.running"> · {{ t('chat.running') }}</span></small></span>
						</BaseButton>
					</li>
				</ul>
				<div
					v-if="(sessions.data.value?.total_pages ?? 0) > 1"
					class="session-pagination"
				>
					<BaseButton
						:aria-disabled="listPage === 1"
						@click="listPage > 1 && listPage--"
					>
						{{ t('tour.back') }}
					</BaseButton><span>{{ listPage }} / {{ sessions.data.value?.total_pages }}</span><BaseButton
						:aria-disabled="listPage >= (sessions.data.value?.total_pages ?? 1)"
						@click="listPage < (sessions.data.value?.total_pages ?? 1) && listPage++"
					>
						{{ t('tour.next') }}
					</BaseButton>
				</div>
				<p class="muted session-note">
					<Icon icon="lock" /> {{ t('chat.savedOnServer') }}
				</p>
			</aside>
			<section
				class="chat-main"
				:aria-label="t('tcymc.text.assistant_conversation')"
			>
				<div
					v-if="chatID && current.isError.value"
					class="chat-error"
				>
					<p>{{ t('chat.loadFailed') }}</p><XButton
						variant="secondary"
						@click="current.refetch()"
					>
						{{ t('chat.retry') }}
					</XButton>
				</div>
				<div
					v-if="active"
					class="conversation-toolbar"
				>
					<form
						v-if="rename"
						class="rename-form"
						@submit.prevent="manage('rename')"
					>
						<input
							v-model="newTitle"
							class="input"
							maxlength="150"
							:aria-label="t('chat.rename')"
						><XButton
							type="submit"
							:aria-disabled="!newTitle.trim() || editingBusy"
						>
							{{ t('misc.save') }}
						</XButton><BaseButton @click="rename = false">
							{{ t('misc.cancel') }}
						</BaseButton>
					</form>
					<strong
						v-else
						class="conversation-title"
					>{{ active.title || t('chat.untitled') }}</strong>
					<div class="toolbar-actions">
						<BaseButton
							class="toolbar-button"
							:aria-label="t('chat.rename')"
							:aria-disabled="busy"
							@click="!busy && (newTitle = active.title ?? '', rename = true)"
						>
							<Icon icon="pen" />
						</BaseButton><BaseButton
							class="toolbar-button"
							:aria-disabled="busy || (active.turns?.length ?? 0) < 5"
							@click="!busy && (active.turns?.length ?? 0) >= 5 && manage('compact')"
						>
							<Icon icon="compress" /> {{ t('chat.compact') }}
						</BaseButton><BaseButton
							class="toolbar-button"
							:aria-label="t('chat.delete')"
							:aria-disabled="busy"
							@click="!busy && manage('delete')"
						>
							<Icon icon="trash-alt" />
						</BaseButton>
					</div>
				</div>
				<details
					v-if="active?.compactions?.length"
					class="summary-banner"
				>
					<summary><Icon icon="compress" /> {{ t('chat.compacted', {count: active.compactions.at(-1)?.through}) }}</summary><p class="muted">
						{{ t('chat.originalsPreserved') }}
					</p><p class="summary-text">
						{{ active.compactions.at(-1)?.summary }}
					</p><p class="muted">
						{{ active.compactions.at(-1)?.model }} · {{ t('chat.totalTokens') }}: {{ active.compactions.at(-1)?.usage?.reported ? (active.compactions.at(-1)?.usage?.input ?? 0) + (active.compactions.at(-1)?.usage?.output ?? 0) : t('chat.unavailable') }}
					</p>
				</details>
				<div
					ref="thread"
					class="conversation"
					@scroll="thread && (stickToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120)"
				>
					<div
						v-if="!active?.turns?.length"
						class="welcome"
					>
						<span class="welcome-symbol"><Icon icon="robot" /></span><h2>{{ t('tcymc.text.start_with_a_sentence') }}</h2><p>{{ t('tcymc.text.check_progress_break_down_a_plan_or_turn') }}</p><div class="suggestions">
							<XButton
								variant="secondary"
								@click="prompt = t('tcymc.text.list_my_unfinished_tasks_and_suggest_a_plan')"
							>
								{{ t('tcymc.text.what_should_i_do_today') }}
							</XButton><XButton
								variant="secondary"
								@click="prompt = t('tcymc.text.create_a_task_in_this_project_to_write')"
							>
								{{ t('tcymc.text.create_a_task_with_one_sentence') }}
							</XButton>
						</div>
					</div>
					<ChatTurnCard
						v-for="turn in active?.turns"
						:key="turn.id"
						:turn="turn"
						:busy="busy"
						@fork="manage('fork', $event)"
					/>
				</div>
				<div
					v-if="!hasAssistant && !settings.isPending.value"
					class="setup-note"
				>
					{{ t('tcymc.text.add_a_connection_in_ai_and_voice_settings') }}
				</div>
				<details
					class="context-options"
					data-tour="ai-permissions"
				>
					<summary>{{ t('chat.contextAndPermissions') }}</summary><section
						class="assistant-options"
						:aria-label="t('tcymc.text.assistant_permissions')"
					>
						<label>{{ t('chat.model') }}<select
							v-model="connectionID"
							class="input"
						><option value="">{{ t('chat.defaultModel') }}{{ settings.data.value?.connections.find(c => c.id === settings.data.value?.assistant)?.model ? ` · ${settings.data.value.connections.find(c => c.id === settings.data.value?.assistant)?.model}` : '' }}</option><option
							v-for="connection in chatModels"
							:key="connection.id"
							:value="connection.id"
						>{{ connection.name }} · {{ connection.model }}</option></select></label><label>{{ t('tcymc.text.current_project') }}<select
							v-model.number="projectID"
							class="input"
						><option :value="0">{{ t('tcymc.text.all_accessible_projects') }}</option><option
							v-for="project in projectsArray.filter(p => p.id > 0 && !p.is_archived)"
							:key="project.id"
							:value="project.id"
						>{{ project.title }}</option></select></label><label>{{ t('tcymc.text.working_mode') }}<select
							v-model="mode"
							class="input"
						><option value="read">{{ t('tcymc.text.read_only_look_up_tasks_and_suggest_changes') }}</option><option value="write">{{ t('tcymc.text.execute_allow_creation_and_changes') }}</option></select></label><label class="checkbox"><input
							v-model="allowDelete"
							type="checkbox"
							:disabled="mode === 'read'"
						>{{ t('tcymc.text.allow_task_deletion_for_this_request') }}</label>
					</section>
				</details>
				<form
					class="composer"
					@submit.prevent="submit"
				>
					<label
						for="ai-prompt"
						class="composer-label"
					>{{ t('tcymc.text.your_request') }}</label><textarea
						id="ai-prompt"
						v-model="prompt"
						data-tour="ai-prompt"
						class="textarea"
						rows="3"
						maxlength="12000"
						:placeholder="t('tcymc.text.for_example_move_the_due_dates_of_unfinished')"
						@keydown="composerKeydown"
					/><div
						class="composer-tools"
						data-tour="ai-voice"
					>
						<XButton
							variant="secondary"
							type="button"
							:icon="recording ? 'stop' : 'microphone'"
							:aria-disabled="(busy && !recording) || !hasSpeech"
							@click="toggleRecording"
						>
							{{ recording ? t('tcymc.stopRecording', {seconds: elapsed}) : t('tcymc.text.record_audio') }}
						</XButton><XButton
							variant="secondary"
							icon="cloud-upload-alt"
							:aria-disabled="busy || !hasSpeech"
							@click="!busy && hasSpeech && audioInput?.click()"
						>
							{{ t('tcymc.text.upload_audio') }}
						</XButton><input
							ref="audioInput"
							class="audio-upload"
							type="file"
							accept="audio/*"
							@change="upload"
						><label class="checkbox"><input
							v-model="tidy"
							type="checkbox"
						>{{ t('tcymc.text.clean_up_the_transcript') }}</label><XButton
							variant="secondary"
							:aria-disabled="busy || !prompt.trim() || !settings.data.value?.cleanup"
							@click="tidyText"
						>
							{{ t('tcymc.text.clean_up_text') }}
						</XButton><XButton
							v-if="activeRun"
							variant="primary"
							icon="stop"
							class="send"
							:aria-disabled="action.isPending.value"
							@click="manage('stop')"
						>
							{{ t('chat.stop') }}
						</XButton><XButton
							v-else
							variant="primary"
							icon="arrow-up"
							class="send"
							type="submit"
							:aria-disabled="busy || !hasAssistant || !prompt.trim()"
						>
							{{ send.isPending.value ? t('chat.sending') : t('tcymc.text.send_request') }}
						</XButton>
					</div><p class="composer-hint">
						{{ t('chat.enterHint') }}
					</p><p
						v-if="notice"
						role="status"
						class="notice"
					>
						{{ notice }}
					</p><details v-if="original">
						<summary>{{ t('tcymc.text.view_original_transcript_or_text') }}</summary><p class="original">
							{{ original }}
						</p>
					</details>
				</form>
				<details
					class="system-prompt"
					@toggle="showSystemPrompt = ($event.target as HTMLDetailsElement).open"
				>
					<summary><Icon icon="code" /> {{ t('chat.systemPrompt') }}</summary><p v-if="effectivePrompt.isPending.value">
						{{ t('misc.loading') }}
					</p><template v-else>
						<pre>{{ effectivePrompt.data.value?.system_prompt }}</pre><details><summary>{{ t('chat.availableTools') }}</summary><pre>{{ effectivePrompt.data.value?.tool_schema }}</pre></details><p class="muted">
							{{ t('chat.promptNote') }}
						</p>
					</template>
				</details>
			</section>
		</div>
	</div>
</template>

<style scoped lang="scss">
.tcy-assistant {
	max-inline-size: 1450px;
	margin-inline: auto;
	padding: .5rem;
	min-inline-size: 0;
}
.assistant-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: .75rem;
	margin-block-end: 1rem;
}
.eyebrow {
	color: var(--primary);
	font-size: .7rem;
	letter-spacing: .1em;
}
h1 {
	font-size: 1.6rem;
	margin-block: .375rem;
}
.heading-actions, .toolbar-actions {
	display: flex;
	align-items: center;
	gap: .5rem;
	flex-wrap: wrap;
}
.chat-shell {
	display: grid;
	grid-template-columns: 220px minmax(0, 1fr);
	gap: 1rem;
	min-inline-size: 0;
}
.chat-sidebar {
	padding: 1rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: 1rem;
	align-self: start;
}
.chat-sidebar > .button {
	inline-size: 100%;
	margin-block-end: .75rem;
}
.chat-sidebar ul {
	list-style: none;
	margin: 0;
	padding: 0;
	max-block-size: 65dvh;
	overflow-y: auto;
}
.session-link {
	display: flex;
	align-items: center;
	gap: .625rem;
	inline-size: 100%;
	text-align: start;
	padding: .75rem .5rem;
	border-radius: .5rem;
	color: var(--text);
}
.session-link > span {
	min-inline-size: 0;
}
.session-link strong {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: .85rem;
}
.session-link small {
	display: block;
	font-size: .75rem;
	color: var(--text-light);
	margin-block-start: .25rem;
}
.session-link.is-selected, .session-link:hover {
	background: var(--grey-100);
}
.session-link.is-selected {
	box-shadow: inset 3px 0 var(--primary);
}
.session-note {
	border-block-start: 1px solid var(--grey-200);
	padding-block-start: .75rem;
	margin-block-start: .75rem;
	font-size: .75rem;
}
.session-pagination {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: .5rem;
	margin-block: .75rem;
	font-size: .8rem;
}
.session-pagination button {
	min-block-size: 44px;
}
.chat-main {
	min-inline-size: 0;
	padding: 1rem;
	border: 1px solid var(--grey-200);
	border-radius: 1rem;
	background: var(--white);
}
.conversation-toolbar {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: .5rem;
	padding-block-end: .75rem;
	border-block-end: 1px solid var(--grey-200);
}
.conversation-title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-inline-size: 0;
}
.toolbar-actions {
	flex-shrink: 0;
}
.toolbar-button {
	display: inline-flex;
	align-items: center;
	gap: .375rem;
	min-block-size: 44px;
	min-inline-size: 32px;
	justify-content: center;
	font-size: .8rem;
	color: var(--text-light);
}
.rename-form {
	display: flex;
	flex-wrap: wrap;
	gap: .5rem;
}
.rename-form input {
	max-inline-size: 15rem;
}
.conversation {
	min-block-size: 240px;
	max-block-size: 65dvh;
	overflow-y: auto;
	padding-inline: .5rem;
	overscroll-behavior: contain;
	scrollbar-gutter: stable;
}
.welcome {
	padding: 2.5rem .5rem;
	text-align: center;
}
.welcome-symbol {
	display: inline-flex;
	padding: 1rem;
	border-radius: 1rem;
	background: var(--grey-100);
	color: var(--primary);
	font-size: 2rem;
	margin-block-end: 1rem;
}
.welcome h2 {
	font-size: 1.4rem;
	margin-block-end: .75rem;
}
.welcome p, .muted {
	color: var(--text-light);
	font-size: .85rem;
	line-height: 1.6;
}
.suggestions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: .625rem;
	margin-block-start: 1rem;
}
.context-options {
	margin-block: .75rem;
	font-size: .8rem;
}
summary {
	cursor: pointer;
	min-block-size: 32px;
}
.assistant-options {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	align-items: end;
	gap: .75rem;
	padding: .75rem;
	background: var(--grey-100);
	border-radius: .75rem;
}
.assistant-options > label {
	display: grid;
	gap: .375rem;
	font-size: .8rem;
	min-inline-size: 0;
}
.assistant-options select {
	inline-size: 100%;
	min-inline-size: 0;
}
.assistant-options > .checkbox {
	display: flex;
	align-items: center;
	gap: .4rem;
	grid-column: 1 / -1;
}
.composer {
	padding: 1rem;
	border: 1px solid var(--grey-300);
	border-radius: .875rem;
	background: var(--white);
}
.composer-label {
	display: block;
	margin-block-end: .5rem;
	font-size: .85rem;
	font-weight: 600;
}
.composer .textarea {
	min-block-size: 5rem;
	resize: vertical;
	border: 0;
	box-shadow: none;
}
.composer-tools {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: .5rem;
	margin-block-start: .75rem;
}
.composer-tools .checkbox {
	font-size: .75rem;
}
.composer-tools :deep(.button) {
	font-size: .75rem;
}
.send {
	margin-inline-start: auto;
}
.audio-upload {
	display: none;
}
.composer-hint {
	margin-block: .5rem 0;
	color: var(--text-light);
	font-size: .75rem;
}
.notice, .original, .summary-text {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	margin-block-start: .5rem;
}
.notice, .setup-note, .chat-error {
	padding: .75rem;
	background: var(--grey-100);
	border-inline-start: 3px solid var(--primary);
	margin-block: .75rem;
	font-size: .85rem;
}
.summary-banner {
	padding: .75rem;
	background: var(--grey-100);
	border-radius: .75rem;
	margin-block: .75rem;
	font-size: .85rem;
}
.system-prompt {
	font-size: .8rem;
	color: var(--text-light);
	margin-block-start: .75rem;
}
.system-prompt pre {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	max-block-size: 20rem;
	overflow-y: auto;
}
[aria-disabled="true"] {
	opacity: .5;
	cursor: default;
}
@media (width >= 1100px) {.heading-actions > .button:first-child {
	display: none;
}
}
@media (width < 1100px) {.chat-shell {
	grid-template-columns: minmax(0, 1fr);
}.chat-sidebar {
	display: none;
}.chat-sidebar.is-open {
	display: block;
}
}
@media (width <= 600px) {.tcy-assistant {
	padding: 0;
}h1 {
	font-size: 1.3rem;
}
.chat-main {
	padding: .75rem;
}
.assistant-options {
	grid-template-columns: minmax(0, 1fr);
}
.conversation-toolbar {
	flex-wrap: wrap;
}
.conversation-title {
	inline-size: 100%;
}
.conversation {
	padding-inline: 0;
}
}
@media (width >= 1100px) {
 .chat-main {
  display: flex;
  flex-direction: column;
  block-size: calc(100dvh - 13rem);
  min-block-size: 34rem;
  overflow-y: auto;
 }
 .conversation {
  flex: 1 1 0;
  min-block-size: 0;
  max-block-size: none;
 }
 .conversation-toolbar, .composer, .context-options, .system-prompt, .summary-banner, .chat-error, .setup-note {
  flex-shrink: 0;
 }
 .system-prompt[open], .summary-banner[open] {
  max-block-size: 12rem;
  overflow-y: auto;
 }
 .composer .textarea {
  min-block-size: 3.5rem;
  max-block-size: 10rem;
 }
}
</style>
