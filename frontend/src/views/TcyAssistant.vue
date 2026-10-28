<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const {t} = useI18n({useScope: 'global'})
import {audioChatFile} from '@/helpers/tcyAudio'
import {useConversationEvents} from '@/client/queries/conversationEvents'
import {computed, onBeforeUnmount, ref, watch, nextTick} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {aiSettingsQuery, useCleanupAI, useTranscribeAI} from '@/client/queries/tcyAi'
import AssistantPreferences from '@/components/ai/AssistantPreferences.vue'
import {assistantPreferencesQuery} from '@/client/queries/assistantPreferences'
import {builtinProfileIDs, normalizeOptions, profileOptions, validOptions, type AssistantOptions} from '@/helpers/assistantProfiles'
import AronaAvatar from '@/components/ai/AronaAvatar.vue'
import ChatTurnCard from '@/components/ai/ChatTurnCard.vue'
import ChatAttachmentCard from '@/components/ai/attachments/ChatAttachmentCard.vue'
import ConversationExport from '@/components/ai/export/ConversationExport.vue'
import UploadProgressRow from '@/components/misc/UploadProgressRow.vue'
import {chatBytes} from '@/components/ai/export/files'
import {useUploadChatAttachment, useRemoveChatAttachment} from '@/client/queries/chatAttachments'
import {uploads} from '@/helpers/uploadTransport'
import BaseButton from '@/components/base/BaseButton.vue'
import {
	conversationsQuery,
	conversationQuery,
	promptQuery,
	useCreateConversation,
	useConversationAction,
	useSendConversation,
	useReviewConversation,
	useRefreshAgentChanges,
} from '@/client/queries/tcyConversations'
import {useProjects} from '@/composables/useProjects'
import {useTitle} from '@/composables/useTitle'
import type {ReviewInput} from '@/client/generated'
import {openDiagnostics, openCompactDiagnostic} from '@/helpers/diagnostics'
import {captureClientRequestContext, isClientRequestContextCurrent, isRequestContextAbort} from '@/client/requestContext'

useTitle(() => t('tcymc.text.ai_task_assistant'))
const route = useRoute()
const projectID = ref(Number(route.query.project) || 0)
const contextTaskID = computed(() => Number(route.query.task) || 0)
const {projectsArray} = useProjects()
const settings = useQuery(aiSettingsQuery())
const router = useRouter()
const create = useCreateConversation()
const action = useConversationAction()
const send = useSendConversation()
const review = useReviewConversation()
const paused = computed(() => active.value?.turns?.at(-1)?.result?.pause)
const refreshChanges = useRefreshAgentChanges()
const listPage = ref(1)
const sessions = useQuery(computed(() => conversationsQuery(listPage.value)))
const chatID = computed(() => typeof route.query.chat === 'string' ? route.query.chat : '')
const events = useConversationEvents(chatID)
const current = useQuery(computed(() => ({...conversationQuery(chatID.value), refetchInterval: events.connected.value ? false : 1000})))
const active = computed(() => current.data.value)
const canCompact = computed(() => (active.value?.turns?.length ?? 0) > (active.value?.compactions?.at(-1)?.through ?? 0))
const activeRun = computed(() => Boolean(active.value?.compacting || active.value?.turns?.some(turn => turn.status === 'running')))
const sidebarOpen = ref(false)
const connectionID = ref('')
const chatModels = computed(() => settings.data.value?.connections.filter(c => c.kind === 'chat') ?? [])
const selectedConnection = computed(() => connectionID.value || settings.data.value?.assistant || '')
const exportOpen = ref(false)
const fileInput = ref<HTMLInputElement>()
const uploadFile = useUploadChatAttachment()
const removeFile = useRemoveChatAttachment()
const uploadingFiles = ref(false)
let fileController: AbortController | undefined
const draftFiles = computed(() => active.value?.draft_attachments ?? [])
const imageModel = computed(() => {
	const model = chatModels.value.find(c => c.id === selectedConnection.value)
	return (model?.resolved?.input_types ?? model?.input_types ?? []).includes('image')
})
const imageMismatch = computed(() => !imageModel.value && draftFiles.value.some(f => /^image\/(png|jpeg|webp|gif)$/.test(f.mime || '')))
const attachmentProgress = computed(() => uploads.value.filter(u => u.targetPath.endsWith(`/ai/conversations/${chatID.value}/attachments`)).slice(0, 3))
async function addFiles(files: File[]) {
	if (!files.length || busy.value) return
	if (files.some(f => f.size > 32 * 1024 * 1024) || files.length + draftFiles.value.length > 16) { notice.value = t('chatFiles.limits'); return }
	uploadingFiles.value = true
	fileController = new AbortController()
	const location = route.fullPath
	const requestContext = captureClientRequestContext()
	try {
		let id = chatID.value
		if (!id) {
			const created = await create.mutateAsync()
			if (disposed || route.fullPath !== location || !isClientRequestContextCurrent(requestContext)) return
			id = created.id!
			saveOptions(id, currentOptions.value, selectedProfile.value)
			await router.replace({name: 'tcy-ai', query: {...route.query, chat: id}})
		}
		for (const file of files) { await uploadFile.mutateAsync({id, file, signal: fileController.signal}) }
	} catch (e) { if (!isRequestContextAbort(e) && !fileController.signal.aborted) notice.value = t('chatFiles.uploadFailed') }
	finally { uploadingFiles.value = false; if (fileInput.value) fileInput.value.value = '' }
}
function pasteFiles(event: ClipboardEvent) {
	const files = Array.from(event.clipboardData?.files ?? [])
	if (files.length) { event.preventDefault(); void addFiles(files) }
}
async function removeDraft(file: string) { try { await removeFile.mutateAsync({id: chatID.value, file}) } catch { return } }
onBeforeUnmount(() => fileController?.abort())
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
const approval = ref<'smart' | 'review' | 'auto'>('smart')
const writeProjectIDs = ref<number[]>([])
const maxRounds = ref(8)
const maxOperations = ref(20)
const timeoutSeconds = ref(120)
const tokenBudget = ref(0)
const preferences = useQuery(assistantPreferencesQuery())
const preferencesOpen = ref(false)
const selectedProfile = ref('ask')
const initializedChat = ref<string | null>(null)
const optionsReady = computed(() => initializedChat.value === chatID.value)
const currentOptions = computed<AssistantOptions>(() => ({connection_id: connectionID.value, project_id: projectID.value, mode: mode.value, allow_delete: allowDelete.value, approval: approval.value, write_project_ids: writeProjectIDs.value, max_rounds: maxRounds.value, max_operations: maxOperations.value, timeout_seconds: timeoutSeconds.value, token_budget: tokenBudget.value}))
const profiles = computed(() => [...builtinProfileIDs.map(id => ({id, name: t(`assistantUI.presets.${id}.name`)})), ...(preferences.data.value?.profiles ?? []).map(p => ({id: p.id!, name: p.name!}))])
function applyOptions(o: AssistantOptions, profile: string, remember = true) {
	connectionID.value = o.connection_id; projectID.value = o.project_id; mode.value = o.mode; allowDelete.value = o.allow_delete; approval.value = o.approval
	writeProjectIDs.value = [...o.write_project_ids]; maxRounds.value = o.max_rounds; maxOperations.value = o.max_operations; timeoutSeconds.value = o.timeout_seconds; tokenBudget.value = o.token_budget
	selectedProfile.value = profile
	if (remember) {
		saveOptions(chatID.value, o, profile)
		notice.value = t('assistantUI.applied')
	}

}
function selectProfile(id: string) {
	const custom = preferences.data.value?.profiles?.find(p => p.id === id)
	const options = custom ? normalizeOptions(custom.options) : {...profileOptions(id), connection_id: connectionID.value, project_id: projectID.value}
	applyOptions(options, id)
}
function optionsStorageKey(id: string) {
	const context = captureClientRequestContext()
	return `tcy-ai-options:${JSON.stringify([context.apiBaseUrl, context.identity, id])}`
}
function saveOptions(id: string, options: AssistantOptions, profile: string) {
	try { sessionStorage.setItem(optionsStorageKey(id), JSON.stringify({options, profile})) } catch { /* The server still retains sent configurations. */ }
}
watch([() => preferences.data.value, active, chatID], ([value, conversation, id]) => {
	if (!value || initializedChat.value === id || (id && conversation?.id !== id)) return
	let saved: {options: AssistantOptions, profile: string} | undefined
	try {
		const candidate = JSON.parse(sessionStorage.getItem(optionsStorageKey(id)) || 'null')
		if (candidate && validOptions(candidate.options) && ['read', 'write'].includes(candidate.options.mode)) saved = candidate
	} catch { /* Ignore unavailable or obsolete browser preferences. */ }
	const last = conversation?.turns?.at(-1)?.result?.configuration
	const defaultID = value.default_profile || 'ask'
	const custom = value.profiles?.find(p => p.id === defaultID)
	const options = saved?.options ?? (last ? normalizeOptions(last) : custom ? normalizeOptions(custom.options) : profileOptions(defaultID))
	if (Number(route.query.project)) options.project_id = Number(route.query.project)
	applyOptions(options, saved?.profile ?? (last ? '' : defaultID), false)
	initializedChat.value = id
}, {immediate: true})
watch(mode, value => {if (value === 'read') allowDelete.value = false})
function resizeComposer() {
	const el = document.getElementById('ai-prompt') as HTMLTextAreaElement | null
	if (!el) return
	el.style.height = 'auto'
	el.style.height = `${Math.min(el.scrollHeight, 180)}px`
}
watch(prompt, async () => {await nextTick(); resizeComposer()})
const voiceOpen = ref(false)
const effectivePrompt = useQuery(computed(() => promptQuery(projectID.value, mode.value, allowDelete.value, showSystemPrompt.value)))
const tidy = ref(true)
const original = ref('')
const notice = ref('')
const audioInput = ref<HTMLInputElement>()
const recording = ref(false)
const audioStage = ref('')
const elapsed = ref(0)
const editingBusy = computed(() => uploadingFiles.value || removeFile.isPending.value || Boolean(audioStage.value) || review.isPending.value || create.isPending.value || send.isPending.value || action.isPending.value || transcribe.isPending.value || cleanup.isPending.value || recording.value)
const busy = computed(() => !optionsReady.value || editingBusy.value || activeRun.value || Boolean(paused.value))
const hasAssistant = computed(() => chatModels.value.some(c => c.id === selectedConnection.value))
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
	if ((!prompt.value.trim() && !draftFiles.value.length) || busy.value || !hasAssistant.value || imageMismatch.value) return
	const originalPrompt = prompt.value
	const message = prompt.value.trim() || t('chatFiles.defaultPrompt')
	const id = chatID.value
	const location = route.fullPath
	const request = {
		message,
		attachment_ids: draftFiles.value.map(f => f.id!),
		history: [],
		project_id: projectID.value,
		mode: mode.value,
		allow_delete: allowDelete.value && mode.value === 'write',
		approval: approval.value,
		write_project_ids: [...writeProjectIDs.value], max_rounds: maxRounds.value, max_operations: maxOperations.value,
		timeout_seconds: timeoutSeconds.value, token_budget: tokenBudget.value,
		page_context: JSON.stringify({page: route.name, project_id: projectID.value, task_id: Number(route.query.task) || undefined}),
		request_id: crypto.randomUUID(),
		connection_id: selectedConnection.value,
	}
	try {
		let target = id
		if (!target) {
			const created = await create.mutateAsync()
			target = created.id!
			if (route.name !== 'tcy-ai' || route.fullPath !== location) return
			saveOptions(target, currentOptions.value, selectedProfile.value)
			await router.replace({name: 'tcy-ai', query: {...route.query, chat: target}})
		}
		await send.mutateAsync({id: target, body: request})
		if (chatID.value === target && prompt.value === originalPrompt) {
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

async function reviewOperation(body: ReviewInput) {
	if (!chatID.value || review.isPending.value) return
	try { await review.mutateAsync({id: chatID.value, body}) } catch { return }
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
watch(() => active.value?.turns?.at(-1)?.result, async () => {
	await nextTick()
	if (stickToBottom.value && thread.value) thread.value.scrollTo({top: thread.value.scrollHeight, behavior: 'instant'})
})

async function processAudio(file: Blob, filename: string) {
	if (file.size > 16 * 1024 * 1024) { notice.value = t('tcymc.text.audio_must_not_exceed_16_mib'); return }
	if (!file.size) { notice.value = t('tcymc.text.the_recording_is_empty_please_try_again'); return }
	notice.value = ''
	audioStage.value = 'preparing'
	const connection = settings.data.value?.connections.find(c => c.id === settings.data.value?.transcription)
	if (connection?.protocol === 'openai-audio') {
		try { audioStage.value = 'audioConverting'; const converted = await audioChatFile(file, filename); file = converted.file; filename = converted.filename }
		catch { audioStage.value = ''; notice.value = t('tcymc.audioConversionFailed'); return }
	}
	try {
		const audio = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(String(reader.result).split(',')[1])
			reader.onerror = reject
			reader.readAsDataURL(file)
		})
		audioStage.value = 'audioProcessing'
		const result = await transcribe.mutateAsync({audio, filename, cleanup: tidy.value})
		if (disposed) return
		original.value = result.original ?? ''
		prompt.value = [prompt.value, result.text].filter(Boolean).join('\n')
		notice.value = result.warning || t('tcymc.text.transcription_complete_edit_the_text_if_needed_then')
	} catch (e) { if (isRequestContextAbort(e)) return; notice.value = t('tcymc.text.speech_recognition_failed_check_the_model_settings_or') } finally { audioStage.value = '' }
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
			<div class="heading-actions">
				<BaseButton
					class="toolbar-button"
					:aria-label="t('chat.conversations')"
					:aria-expanded="sidebarOpen"
					@click="sidebarOpen = !sidebarOpen"
				>
					<Icon icon="history" />
				</BaseButton>
				<AronaAvatar /><h1>{{ t('tcymc.text.ai_task_assistant') }}</h1>
				<BaseButton
					class="toolbar-button"
					:aria-label="t('chat.new')"
					:aria-disabled="editingBusy"
					@click="newConversation"
				>
					<Icon icon="pen" />
				</BaseButton>
			</div>
			<div class="heading-actions">
				<label class="model-switch"><span class="is-sr-only">{{ t('chat.model') }}</span><select
					v-model="connectionID"
					:disabled="!optionsReady"
					@change="applyOptions(currentOptions, '')"
				><option value="">{{ settings.data.value?.connections.find(c => c.id === settings.data.value?.assistant)?.name || t('chat.defaultModel') }}</option><option
					v-for="c in chatModels"
					:key="c.id"
					:value="c.id"
				>{{ c.name }}</option><option
					v-if="connectionID && !chatModels.some(c => c.id === connectionID)"
					:value="connectionID"
				>{{ t('assistantUI.missingModel') }}</option></select></label>
				<BaseButton
					class="toolbar-button"
					:title="t('debug.title')"
					:aria-label="t('debug.title')"
					@click="openDiagnostics"
				>
					<Icon icon="code" />
				</BaseButton>
			</div>
		</header>
		<p
			v-if="contextTaskID > 0"
			class="summary-banner"
		>
			{{ t('agent.currentTask') }} <RouterLink :to="{name: 'task.detail', params: {id: contextTaskID}}">
				#{{ contextTaskID }}
			</RouterLink>
		</p>
		<p class="live-connection">
			<template v-if="chatID">
				<span :class="{connected: events.connected.value}" />{{ events.connected.value ? t('flow.liveConnected') : t('flow.reconnecting') }} ·
			</template>{{ t('flow.backgroundNote') }}
		</p>
		<div
			class="chat-shell"
			:class="{'with-history': sidebarOpen}"
		>
			<aside
				v-if="sidebarOpen"
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
							:aria-label="t('chatFiles.export')"
							:title="t('chatFiles.export')"
							@click="exportOpen = true"
						>
							<Icon icon="download" />
						</BaseButton>
						<BaseButton
							class="toolbar-button"
							:aria-label="t('chat.rename')"
							:aria-disabled="busy"
							@click="!busy && (newTitle = active.title ?? '', rename = true)"
						>
							<Icon icon="pen" />
						</BaseButton><BaseButton
							class="toolbar-button"
							:aria-disabled="busy || !canCompact"
							@click="!busy && canCompact && manage('compact')"
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
					v-if="active?.storage"
					class="conversation-storage"
				>
					<summary>{{ t('chatFiles.storageLine', {bytes: chatBytes(active.storage.total_bytes), count: active.storage.attachment_count}) }}</summary>
					<p>{{ t('chatFiles.storageDetail', {record: chatBytes(active.storage.record_bytes), files: chatBytes(active.storage.attachment_bytes)}) }}</p>
					<p>{{ t('chatFiles.storageHint') }}</p>
					<p v-if="active.storage.missing_count">
						{{ t('chatFiles.missingCount', {count: active.storage.missing_count}) }}
					</p>
				</details>
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
				<section
					v-if="active?.compacting || active?.compact_error || active?.compact_progress"
					class="compact-progress"
					role="status"
				>
					<strong>{{ active.compacting ? t('flow.compacting') : active.compact_error ? t('flow.compactFailed') : t('flow.compactDone') }}</strong>
					<p v-if="active.compact_progress">
						{{ t('flow.compactBatch', {batch: active.compact_progress.batch, total: active.compact_progress.batches, attempt: active.compact_progress.attempt}) }}
						· {{ t('chat.totalTokens') }}: {{ active.compact_progress.usage?.reported ? (active.compact_progress.usage.input ?? 0) + (active.compact_progress.usage.output ?? 0) : t('chat.unavailable') }}
						· {{ ((active.compact_progress.duration_ms ?? 0) / 1000).toFixed(1) }} s
					</p>
					<progress
						v-if="active.compacting"
						:aria-label="t('flow.compacting')"
					/>
					<p v-if="active.compact_error">
						{{ active.compact_error }}
					</p>
					<details v-if="active.compacting && active.compact_text">
						<summary>{{ t('flow.compactDraft') }}</summary>
						<pre>{{ active.compact_text }}</pre>
					</details>
					<button
						v-if="active.compact_error && !busy && canCompact"
						type="button"
						class="text-button"
						@click="manage('compact')"
					>
						{{ t('flow.compactRetry') }}
					</button>
					<button
						type="button"
						class="text-button"
						@click="openCompactDiagnostic(active)"
					>
						{{ t('flow.compactDiagnostics') }}
					</button>
				</section>
				<div
					ref="thread"
					class="conversation"
					@scroll="thread && (stickToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120)"
				>
					<div
						v-if="!active?.turns?.length"
						class="welcome"
					>
						<AronaAvatar size="large" /><h2>{{ t('tcymc.text.start_with_a_sentence') }}</h2><p>{{ t('tcymc.text.check_progress_break_down_a_plan_or_turn') }}</p><div class="suggestions">
							<XButton
								variant="secondary"
								@click="prompt = t('tcymc.text.list_my_unfinished_tasks_and_suggest_a_plan')"
							>
								{{ t('tcymc.text.what_should_i_do_today') }}
							</XButton><XButton
								variant="secondary"
								@click="selectProfile('plan'); prompt = t('tcymc.text.create_a_task_in_this_project_to_write')"
							>
								{{ t('tcymc.text.create_a_task_with_one_sentence') }}
							</XButton>
						</div>
					</div>
					<TransitionGroup name="message-reveal">
						<ChatTurnCard
							v-for="turn in active?.turns"
							:key="turn.id"
							:turn="turn"
							:conversation-id="chatID"
							:busy="busy"
							:review-busy="review.isPending.value || action.isPending.value"
							@review="reviewOperation"
							@fork="manage('fork', $event)"
						/>
					</TransitionGroup>
				</div>
				<XButton
					v-if="!stickToBottom && active?.turns?.length"
					class="jump-latest"
					variant="secondary"
					icon="arrow-down"
					@click="stickToBottom = true; thread?.scrollTo({top: thread.scrollHeight, behavior: 'instant'})"
				>
					{{ t('flow.jumpLatest') }}
				</XButton>
				<div
					v-if="!hasAssistant && !settings.isPending.value"
					class="setup-note"
				>
					<RouterLink :to="{name: 'user.settings.ai'}">
						{{ t('tcymc.text.add_a_connection_in_ai_and_voice_settings') }}
					</RouterLink>
				</div>

				<p
					v-if="paused"
					class="summary-banner"
				>
					{{ t('agent.waitingReview') }} <BaseButton @click="manage('stop')">
						{{ t('chat.stop') }}
					</BaseButton>
				</p>
				<form
					class="composer"
					@dragover.prevent
					@drop.prevent="addFiles(Array.from($event.dataTransfer?.files ?? []))"
					@paste="pasteFiles"
					@submit.prevent="submit"
				>
					<div
						v-if="draftFiles.length"
						class="chat-attachment-grid draft-files"
					>
						<ChatAttachmentCard
							v-for="file in draftFiles"
							:key="file.id"
							:conversation-id="chatID"
							:file="file"
							removable
							:disabled="busy"
							@remove="removeDraft"
						/>
					</div>
					<div
						v-if="uploadingFiles || attachmentProgress.some(u => ['uploading', 'processing', 'error'].includes(u.stage))"
						class="attachment-upload-progress"
					>
						<UploadProgressRow
							v-for="row in attachmentProgress"
							:key="row.id"
							:row="row"
						/>
					</div>
					<p
						v-if="draftFiles.length"
						class="attachment-input-hint"
					>
						{{ t('chatFiles.fileInputHint') }}
					</p>
					<p
						v-if="imageMismatch"
						class="notice"
						role="status"
					>
						{{ t('chatFiles.imageModelRequired') }}
					</p>
					<label
						for="ai-prompt"
						class="composer-label is-sr-only"
					>{{ t('tcymc.text.your_request') }}</label><textarea
						id="ai-prompt"
						v-model="prompt"
						data-tour="ai-prompt"
						class="textarea"
						rows="1"
						maxlength="12000"
						:placeholder="t('assistantUI.placeholder')"
						@keydown="composerKeydown"
					/><div
						v-if="voiceOpen"
						class="voice-tools"
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
						</XButton>
					</div><p
						v-if="audioStage || cleanup.isPending.value"
						class="audio-progress"
						role="status"
					>
						<progress :aria-label="t(`flow.${audioStage || 'audioProcessing'}`)" /> {{ t(`flow.${audioStage || 'audioProcessing'}`) }}
					</p><div
						class="composer-tools"
						data-tour="ai-voice"
					>
						<div class="composer-context">
							<input
								ref="fileInput"
								type="file"
								multiple
								class="audio-upload"
								@change="addFiles(Array.from(($event.target as HTMLInputElement).files ?? []))"
							>
							<BaseButton
								class="toolbar-button"
								:disabled="busy"
								:title="t('chatFiles.attach')"
								:aria-label="t('chatFiles.attach')"
								@click="fileInput?.click()"
							>
								<Icon icon="paperclip" />
							</BaseButton>
							<label class="profile-switch"><span class="is-sr-only">{{ t('assistantUI.scenarios') }}</span><select
								:value="selectedProfile"
								:disabled="!optionsReady"
								:title="t('assistantUI.scenarios')"
								@change="selectProfile(($event.target as HTMLSelectElement).value)"
							><option
								v-if="!selectedProfile"
								value=""
							>{{ t('assistantUI.custom') }}</option><option
								v-for="p in profiles"
								:key="p.id"
								:value="p.id"
							>{{ p.name }}</option></select></label>
							<BaseButton
								class="toolbar-button preferences-toggle"
								data-tour="ai-permissions"
								:title="t('assistantUI.preferences')"
								:aria-label="t('assistantUI.preferences')"
								:disabled="!optionsReady"
								@click="preferencesOpen = true"
							>
								<Icon icon="cog" />
							</BaseButton>
							<BaseButton
								class="toolbar-button"
								:title="recording ? t('tcymc.stopRecording', {seconds: elapsed}) : t('assistantUI.voiceTools')"
								:aria-label="recording ? t('tcymc.stopRecording', {seconds: elapsed}) : t('assistantUI.voiceTools')"
								:aria-expanded="voiceOpen"
								:class="{'is-recording': recording}"
								@click="recording ? toggleRecording() : (voiceOpen = !voiceOpen)"
							>
								<Icon :icon="recording ? 'stop' : 'microphone'" />
							</BaseButton>
						</div>
						<XButton
							v-if="activeRun"
							variant="primary"
							icon="stop"
							class="send"
							:aria-disabled="action.isPending.value"
							@click="manage('stop')"
						>
							<span class="is-sr-only">{{ t('chat.stop') }}</span>
						</XButton><XButton
							v-else
							variant="primary"
							icon="arrow-up"
							class="send"
							type="submit"
							:aria-disabled="busy || !hasAssistant || (!prompt.trim() && !draftFiles.length) || imageMismatch"
						>
							<span class="is-sr-only">{{ send.isPending.value ? t('chat.sending') : t('tcymc.text.send_request') }}</span>
						</XButton>
					</div><p class="composer-hint">
						{{ t('assistantUI.nextConfiguration') }} {{ mode === 'read' ? t('assistantUI.readStatus') : t(`assistantUI.write_${approval}`) }}<template v-if="projectID">
							· {{ projectsArray.find(p => p.id === projectID)?.title || `#${projectID}` }}
						</template> · {{ t('chat.enterHint') }}
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
			</section>
		</div>
		<ConversationExport
			v-if="exportOpen && active"
			:conversation="active"
			@close="exportOpen = false"
		/>
		<AssistantPreferences
			v-if="preferencesOpen"
			:options="currentOptions"
			:profile="selectedProfile"
			@close="preferencesOpen = false"
			@apply="applyOptions"
		/>
	</div>
</template>

<style scoped lang="scss">
.attachment-input-hint { font-size: .7rem;
color: var(--text-light);
margin-block: .4rem;
}
.conversation-storage { margin: .25rem 1.5rem;
color: var(--text-light);
font-size: .75rem;
flex-shrink: 0;
max-block-size: 6rem;
overflow: auto;
}
.conversation-storage p { margin-block: .3rem;
}
.chat-attachment-grid { display: flex;
gap: .5rem;
flex-wrap: wrap;
}
.draft-files { max-block-size: 180px;
overflow: auto;
margin-block-end: .5rem;
}
.attachment-upload-progress { max-block-size: 8rem;
overflow: auto;
}
@media (width <= 540px) {
 .assistant-heading > .heading-actions:last-child {
flex: 1;
justify-content: flex-end;
}
 .model-switch {
min-inline-size: 0;
}
 .model-switch select {
inline-size: 100%;
}

 .composer-context { flex-wrap: wrap;
}
 .profile-switch select { max-inline-size: 9rem;
}
 .draft-files :deep(.chat-file) { inline-size: 140px;
}
 .conversation-storage { margin-inline: 1rem;
}
}

.tcy-assistant {
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
display: flex;
flex-direction: column;
block-size: 100%;
min-block-size: 0;
color: var(--text);
background: var(--white);
}
.assistant-heading {
display: flex;
align-items: center;
justify-content: space-between;
flex-wrap: wrap;
gap: .5rem;
padding: .6rem 1rem;
flex-shrink: 0;
}
h1 {
font-family: inherit;
font-size: 1.1rem;
font-weight: 600;
margin: 0;
}
.heading-actions, .toolbar-actions, .composer-context {
display: flex;
align-items: center;
gap: .35rem;
min-inline-size: 0;
}
.toolbar-button {
display: inline-flex;
align-items: center;
justify-content: center;
gap: .4rem;
padding: .6rem;
min-block-size: 40px;
min-inline-size: 40px;
border-radius: .65rem;
color: var(--text-light);
font-size: .8rem;
}
.toolbar-button:hover {
background: var(--grey-100);
color: var(--text);
}
.model-switch select, .profile-switch select {
color: var(--text);
background: transparent;
border: 0;
font: inherit;
font-size: .85rem;
padding: .5rem .25rem;
max-inline-size: 14rem;
cursor: pointer;
}
.live-connection {
font-size: .7rem;
color: var(--text-light);
margin: 0;
text-align: center;
padding: .25rem 1rem;
}
.live-connection span {
display: inline-block;
inline-size: .35rem;
block-size: .35rem;
margin-inline-end: .35rem;
background: var(--grey-400);
border-radius: 50%;
}
.live-connection span.connected {
background: var(--success);
}
.chat-shell {
display: grid;
grid-template-columns: minmax(0, 1fr);
flex: 1;
min-block-size: 0;
position: relative;
}
.chat-shell.with-history {
grid-template-columns: 230px minmax(0, 1fr);
}
.chat-sidebar {
background: var(--grey-50, var(--grey-100));
overflow-y: auto;
padding: 1rem;
min-block-size: 0;
border-inline-end: 1px solid var(--grey-100);
}
.chat-sidebar > .button {
inline-size: 100%;
margin-block-end: 1rem;
}
.chat-sidebar ul {
list-style: none;
margin: 0;
padding: 0;
}
.session-link {
display: flex;
gap: .6rem;
align-items: center;
inline-size: 100%;
padding: .7rem .5rem;
border-radius: .6rem;
color: var(--text);
text-align: start;
}
.session-link > span {
min-inline-size: 0;
}
.session-link strong {
display: block;
font-weight: 500;
font-size: .85rem;
white-space: nowrap;
text-overflow: ellipsis;
overflow: hidden;
}
.session-link small {
display: block;
color: var(--text-light);
font-size: .7rem;
margin-block-start: .25rem;
}
.session-link:hover, .session-link.is-selected {
background: var(--grey-200);
}
.session-pagination {
display: flex;
justify-content: space-between;
align-items: center;
margin-block: .5rem;
font-size: .8rem;
}
.session-pagination button {
min-block-size: 44px;
}
.session-note {
margin-block-start: 1rem;
font-size: .7rem;
}
.chat-main {
display: flex;
flex-direction: column;
min-inline-size: 0;
min-block-size: 0;
position: relative;
}
.conversation-toolbar {
display: flex;
align-items: center;
gap: .5rem;
justify-content: space-between;
padding: .25rem 1.5rem;
min-inline-size: 0;
}
.conversation-title {
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
font-size: .8rem;
color: var(--text-light);
font-weight: 400;
}
.rename-form {
display: flex;
gap: .5rem;
align-items: center;
min-inline-size: 0;
flex: 1;
}
.conversation {
flex: 1;
min-block-size: 0;
overflow-y: auto;
overscroll-behavior: contain;
scrollbar-gutter: stable;
padding: 1.5rem max(1.5rem, calc((100% - 48rem) / 2));
scroll-padding-block-end: 2rem;
}
.welcome {
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
min-block-size: 100%;
text-align: center;
padding: 2rem 0;
}
.welcome h2 {
font-family: inherit;
font-size: clamp(1.6rem, 3vw, 2rem);
font-weight: 550;
letter-spacing: -.03em;
margin-block-end: 1rem;
}
.welcome p {
color: var(--text-light);
font-size: .95rem;
max-inline-size: 32rem;
line-height: 1.7;
}
.suggestions {
display: flex;
flex-wrap: wrap;
justify-content: center;
gap: .75rem;
margin-block-start: 1rem;
}
.suggestions :deep(.button) {
border: 1px solid var(--grey-200);
border-radius: 2rem;
background: transparent;
color: var(--text);
box-shadow: none;
font-weight: 400;
font-size: .85rem;
}
.composer {
flex-shrink: 0;
inline-size: calc(100% - 3rem);
max-inline-size: 48rem;
margin: .5rem auto 1.75rem;
position: relative;
padding: .85rem 1rem .65rem;
border: 1px solid var(--grey-200);
border-radius: 1.6rem;
background: var(--grey-100);
box-shadow: 0 2px 8px #00000005;
}
.composer:focus-within {
border-color: var(--grey-400);
}
.composer .textarea {
resize: none;
border: 0;
box-shadow: none;
background: transparent;
padding: .25rem .1rem .75rem;
min-block-size: 2.75rem;
max-block-size: 180px;
border-radius: 0;
font-size: 1rem;
line-height: 1.6;
color: var(--text);
}
.composer-tools {
display: flex;
gap: .5rem;
align-items: center;
justify-content: space-between;
}
.composer .send.is-primary {
flex-shrink: 0;
border-radius: 50%;
inline-size: 40px;
block-size: 40px;
padding: 0;
background: var(--text);
color: var(--white);
border: 0;
box-shadow: none;
}
.composer .send.is-primary:hover {
background: var(--grey-700);
}
.composer-hint {
font-size: .65rem;
color: var(--text-light);
margin: 0;
position: absolute;
inset-block-start: calc(100% + .3rem);
inset-inline: 0;
text-align: center;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
}
.voice-tools {
display: flex;
align-items: center;
flex-wrap: wrap;
gap: .5rem;
padding-block: .5rem;
border-block-end: 1px solid var(--grey-200);
margin-block-end: .5rem;
}
.voice-tools :deep(.button), .voice-tools label {
font-size: .75rem;
}
.audio-upload {
display: none;
}
.audio-progress {
display: flex;
align-items: center;
gap: .5rem;
font-size: .8rem;
}
.audio-progress progress {
inline-size: 4rem;
block-size: .3rem;
}
.muted {
color: var(--text-light);
}
.notice {
color: var(--danger);
font-size: .8rem;
margin: .5rem 0 0;
}
.original {
white-space: pre-wrap;
max-block-size: 8rem;
overflow: auto;
}
.jump-latest {
position: absolute;
inset-inline-start: 50%;
inset-block-end: 9rem;
transform: translateX(-50%);
z-index: 2;
border: 1px solid var(--grey-200);
box-shadow: 0 2px 10px #00000011;
border-radius: 2rem;
font-size: .75rem;
}
.summary-banner, .compact-progress, .setup-note, .chat-error {
padding: .6rem 1rem;
margin: .25rem 1rem;
font-size: .8rem;
background: var(--grey-100);
border-radius: .6rem;
max-block-size: 8rem;
overflow: auto;
flex-shrink: 0;
}
.summary-text {
white-space: pre-wrap;
}
.system-prompt {
font-size: .75rem;
margin-block: 1rem;
}
.system-prompt pre, .compact-progress pre {
white-space: pre-wrap;
overflow-wrap: anywhere;
max-block-size: 12rem;
overflow: auto;
}
summary {
cursor: pointer;
}
.message-reveal-enter-active {
transition: opacity .2s ease, transform .2s ease;
}
.message-reveal-enter-from {
opacity: 0;
transform: translateY(5px);
}
@media (width <= 800px) {
 .chat-shell.with-history {
grid-template-columns: minmax(0, 1fr);
}
 .chat-sidebar {
position: absolute;
inset: 0 auto 0 0;
inline-size: min(300px, 88%);
z-index: 5;
box-shadow: 8px 0 40px #00000022;
}
 .assistant-heading {
padding: .5rem .75rem;
}
 .model-switch select {
max-inline-size: 10rem;
}
 .conversation {
padding: 1rem;
}
 .conversation-toolbar {
padding-inline: 1rem;
}
 .composer {
inline-size: calc(100% - 1.5rem);
padding: .65rem .8rem;
margin-block-end: calc(1.75rem + env(safe-area-inset-bottom, 0px));
}
 .welcome h2 {
font-size: 1.5rem;
}
 .live-connection {
font-size: .6rem;
}
}
@media (prefers-reduced-motion: reduce) {
.message-reveal-enter-active {
transition: none;
} }

@media (height <= 600px) {
 .welcome { display: none;
}
 .composer .textarea { max-block-size: min(180px, 30dvh);
}
 .conversation { padding-block: .25rem;
}
 .live-connection { display: none;
}
 .setup-note { max-block-size: 3rem;
}
}
@media (width <= 540px) {
 .assistant-heading > .heading-actions:last-child {
flex: 1;
justify-content: flex-end;
}
 .model-switch {
min-inline-size: 0;
}
 .model-switch select {
inline-size: 100%;
}

 .assistant-heading { flex-wrap: nowrap;
}
 .assistant-heading h1 { position: absolute;
inline-size: 1px;
block-size: 1px;
overflow: hidden;
clip-path: inset(50%);
white-space: nowrap;
}
}
.toolbar-button.is-recording { color: var(--danger);
}
</style>
