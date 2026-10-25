<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const {t} = useI18n({useScope: 'global'})
import {audioChatFile} from '@/helpers/tcyAudio'
import {computed, onBeforeUnmount, ref} from 'vue'
import {useRoute} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {aiSettingsQuery, useCleanupAI, useRunAI, useTranscribeAI} from '@/client/queries/tcyAi'
import type {AIRunResult} from '@/client/queries/tcyAi'
import {useProjects} from '@/composables/useProjects'
import {useTitle} from '@/composables/useTitle'
import {isRequestContextAbort} from '@/client/requestContext'

useTitle(() => t('tcymc.text.ai_task_assistant'))
const route = useRoute()
const projectID = ref(Number(route.query.project) || 0)
const {projectsArray} = useProjects()
const settings = useQuery(aiSettingsQuery())
const run = useRunAI()
const transcribe = useTranscribeAI()
const cleanup = useCleanupAI()
const prompt = ref('')
const mode = ref<'read' | 'write'>('write')
const allowDelete = ref(false)
const tidy = ref(true)
const original = ref('')
const notice = ref('')
const conversation = ref<{prompt: string, result: AIRunResult}[]>([])
const audioInput = ref<HTMLInputElement>()
const recording = ref(false)
const elapsed = ref(0)
const busy = computed(() => run.isPending.value || transcribe.isPending.value || cleanup.isPending.value)
const hasAssistant = computed(() => Boolean(settings.data.value?.assistant))
const hasSpeech = computed(() => Boolean(settings.data.value?.transcription))
let recorder: MediaRecorder | undefined
let stream: MediaStream | undefined
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false

const labels = computed<Record<string, string>>(() => ({list_projects: t('tcymc.text.find_projects'), list_tasks: t('tcymc.text.find_tasks'), get_task: t('tcymc.text.read_task'), create_project: t('tcymc.text.create_project'), create_task: t('tcymc.text.create_task'), update_task: t('tcymc.text.update_task'), delete_task: t('tcymc.text.delete_task')}))

async function submit() {
	if (!prompt.value.trim() || busy.value || recording.value) return
	const message = prompt.value.trim()
	const history = conversation.value.slice(-5).flatMap(t => [{role: 'user' as const, content: t.prompt}, {role: 'assistant' as const, content: t.result.reply}])
	try {
		const result = await run.mutateAsync({message, history, project_id: projectID.value, mode: mode.value, allow_delete: allowDelete.value && mode.value === 'write', request_id: crypto.randomUUID()})
		conversation.value.push({prompt: message, result})
		prompt.value = ''
	} catch (e) { if (isRequestContextAbort(e)) return; notice.value = t('tcymc.text.the_request_did_not_finish_some_changes_may') }
}

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
	<main class="tcy-assistant">
		<header class="assistant-heading">
			<div>
				<p class="eyebrow">
					{{ t('tcymc.assistantEyebrow') }}
				</p><h1>{{ t('tcymc.text.ai_task_assistant') }}</h1><p>{{ t('tcymc.text.describe_your_plan_and_turn_it_into_tasks') }}</p>
			</div>
			<XButton
				variant="secondary"
				:to="{name: 'user.settings.ai'}"
			>
				{{ t('tcymc.text.ai_and_voice_settings') }}
			</XButton>
		</header>
		<div
			v-if="!hasAssistant && !settings.isPending.value"
			class="setup-note"
		>
			{{ t('tcymc.text.add_a_connection_in_ai_and_voice_settings') }}
		</div>
		<section
			class="assistant-options"
			:aria-label="t('tcymc.text.assistant_permissions')"
		>
			<label>{{ t('tcymc.text.current_project') }}<select
				v-model.number="projectID"
				class="input"
			><option :value="0">{{ t('tcymc.text.all_accessible_projects') }}</option><option
				v-for="project in projectsArray.filter(p => p.id > 0 && !p.is_archived)"
				:key="project.id"
				:value="project.id"
			>{{ project.title }}</option></select></label>
			<label>{{ t('tcymc.text.working_mode') }}<select
				v-model="mode"
				class="input"
			><option value="write">{{ t('tcymc.text.execute_allow_creation_and_changes') }}</option><option value="read">{{ t('tcymc.text.read_only_look_up_tasks_and_suggest_changes') }}</option></select></label>
			<label class="checkbox"><input
				v-model="allowDelete"
				type="checkbox"
				:disabled="mode === 'read'"
			>{{ t('tcymc.text.allow_task_deletion_for_this_request') }}</label>
		</section>
		<section
			class="conversation"
			:aria-label="t('tcymc.text.assistant_conversation')"
			aria-live="polite"
		>
			<div
				v-if="!conversation.length"
				class="welcome"
			>
				<h2>{{ t('tcymc.text.start_with_a_sentence') }}</h2>
				<p>{{ t('tcymc.text.check_progress_break_down_a_plan_or_turn') }}</p>
				<div class="suggestions">
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
			<article
				v-for="(turn, index) in conversation"
				:key="index"
				class="turn"
			>
				<div class="user-message">
					<strong>{{ t('tcymc.text.you') }}</strong><p>{{ turn.prompt }}</p>
				</div>
				<div class="assistant-message">
					<strong>{{ t('tcymc.text.task_assistant') }}</strong><p>{{ turn.result.reply }}</p>
					<details
						v-for="(action, actionIndex) in turn.result.actions"
						:key="actionIndex"
						class="operation"
					>
						<summary>{{ action.success ? '✓' : '×' }} {{ labels[action.tool] || action.tool }} · {{ action.success ? t('tcymc.text.succeeded') : t('tcymc.text.failed') }}</summary><pre>{{ action.arguments }}</pre><pre>{{ action.result }}</pre>
					</details>
				</div>
			</article>
			<p
				v-if="run.isPending.value"
				class="working"
				role="status"
			>
				{{ t('tcymc.text.reading_tasks_and_processing_your_request') }}
			</p>
		</section>
		<form
			class="composer"
			@submit.prevent="submit"
		>
			<label
				for="ai-prompt"
				class="composer-label"
			>{{ t('tcymc.text.your_request') }}</label>
			<textarea
				id="ai-prompt"
				v-model="prompt"
				class="textarea"
				rows="4"
				maxlength="12000"
				:placeholder="t('tcymc.text.for_example_move_the_due_dates_of_unfinished')"
				:disabled="run.isPending.value"
			/>
			<div class="composer-tools">
				<XButton
					variant="secondary"
					type="button"
					:disabled="busy || !hasSpeech"
					@click="toggleRecording"
				>
					{{ recording ? t('tcymc.stopRecording', {seconds: elapsed}) : t('tcymc.text.record_audio') }}
				</XButton>
				<XButton
					variant="secondary"
					:disabled="busy || !hasSpeech || recording"
					@click="audioInput?.click()"
				>
					{{ t('tcymc.text.upload_audio') }}
				</XButton>
				<input
					ref="audioInput"
					class="audio-upload"
					type="file"
					accept="audio/*"
					:disabled="busy || !hasSpeech || recording"
					@change="upload"
				>
				<label class="checkbox"><input
					v-model="tidy"
					type="checkbox"
				>{{ t('tcymc.text.clean_up_the_transcript') }}</label>
				<XButton
					variant="secondary"
					type="button"
					:disabled="busy || !prompt.trim() || !settings.data.value?.cleanup"
					@click="tidyText"
				>
					{{ t('tcymc.text.clean_up_text') }}
				</XButton>
				<XButton
					variant="primary"
					class="send"
					type="submit"
					:disabled="busy || recording || !hasAssistant || !prompt.trim()"
				>
					{{ busy ? t('tcymc.text.working') : t('tcymc.text.send_request') }}
				</XButton>
			</div>
			<p
				v-if="notice"
				role="status"
				class="notice"
			>
				{{ notice }}
			</p>
			<details v-if="original">
				<summary>{{ t('tcymc.text.view_original_transcript_or_text') }}</summary><p class="original">
					{{ original }}
				</p>
			</details>
			<p class="hint">
				{{ t('tcymc.text.record_up_to_3_minutes_or_upload_up') }}
			</p>
		</form>
	</main>
</template>

<style scoped>
.tcy-assistant {
	max-inline-size: 1050px;
	margin-inline: auto;
	padding: 1rem;
}
.assistant-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 1rem;
	margin-block-end: 1.5rem;
}
.eyebrow {
	color: var(--primary);
	font-size: .7rem;
	letter-spacing: .13em;
}
h1 {
	margin-block: .5rem;
	font-size: 2rem;
}
.setup-note {
	margin-block-end: 1rem;
	padding: 1rem;
	border-inline-start: 3px solid var(--primary);
	background: var(--grey-100);
}
.assistant-options {
	display: flex;
	align-items: end;
	flex-wrap: wrap;
	gap: 1rem;
	padding: 1rem;
	border: 1px solid var(--grey-200);
	border-radius: .75rem;
}
.assistant-options > label {
	display: grid;
	gap: .4rem;
	font-size: .85rem;
}
.conversation {
	min-block-size: 260px;
	padding-block: 1.5rem;
}
.welcome {
	padding: 2.5rem 1rem;
	text-align: center;
	color: var(--grey-600);
}
.welcome h2 {
	margin-block-end: .75rem;
	font-size: 1.5rem;
	color: var(--grey-800);
}
.suggestions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: .75rem;
	margin-block-start: 1.5rem;
}
.turn {
	margin-block-end: 1.5rem;
}
.user-message, .assistant-message {
	padding: 1rem 1.25rem;
	border-radius: .75rem;
}
.user-message {
	margin-inline-start: 8%;
	background: var(--grey-100);
}
.assistant-message {
	margin-block-start: .5rem;
	border: 1px solid var(--grey-200);
}
.turn p, .original {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	margin-block-start: .5rem;
}
.operation {
	margin-block-start: .75rem;
	font-size: .85rem;
}
.operation pre {
	max-block-size: 240px;
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	margin-block-start: .5rem;
}
.composer {
	padding: 1rem;
	border: 1px solid var(--grey-300);
	border-radius: .75rem;
	background: var(--white);
}
.composer-label {
	display: block;
	margin-block-end: .5rem;
	font-weight: 600;
}
.composer-tools {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: .75rem;
	margin-block-start: 1rem;
}
.send {
	margin-inline-start: auto;
}
.audio-upload {
	display: none;
}
.checkbox, .hint {
	font-size: .8rem;
}
.hint, .notice {
	margin-block-start: .75rem;
	color: var(--grey-600);
}
.working {
	padding: 1rem;
	color: var(--primary);
}
.is-disabled {
	opacity: .5;
}
@media (width <= 600px) {
	.assistant-heading {
		flex-direction: column;
		align-items: stretch;
	}
	.assistant-options {
		flex-direction: column;
		align-items: stretch;
	}
	.assistant-options select {
		inline-size: 100%;
		min-inline-size: 0;
		max-inline-size: 100%;
	}
	.composer-tools > .button {
		flex: 1 1 auto;
	}
	.send {
		margin-inline-start: 0;
	}
	.welcome {
		padding: 1rem .25rem;
	}
	.user-message {
		margin-inline-start: 0;
	}
	.tcy-assistant {
		min-inline-size: 0;
	}
}
</style>
