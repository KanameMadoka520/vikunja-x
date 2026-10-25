<script setup lang="ts">
import {useI18n} from 'vue-i18n'
const props = defineProps<{initial: AISettings}>()
const {t} = useI18n({useScope: 'global'})
import {audioChatFile} from '@/helpers/tcyAudio'
import {computed, ref} from 'vue'
import type {AIConnection, AISettings} from '@/client/queries/tcyAi'
import {useFetchAIModels, useSaveAISettings, useTestAIConnection} from '@/client/queries/tcyAi'
import {isRequestContextAbort} from '@/client/requestContext'

type Settings = AISettings
function initialDraft(): Settings { return {
	connections: props.initial.connections.map(c => ({...c, api_key: ''})),
	assistant: props.initial.assistant,
	transcription: props.initial.transcription,
	cleanup: props.initial.cleanup,
} }
const draft = ref<Settings>(initialDraft())
const save = useSaveAISettings()
const test = useTestAIConnection()
const testResult = ref('')
const modelFetcher = useFetchAIModels()
const modelLists = ref<Record<string, {models: string[], fingerprint: string}>>({})
const modelNotice = ref<Record<string, string>>({})
const endpointResult = ref('')
const chatModels = computed(() => draft.value.connections.filter(c => c.kind === 'chat'))
const speechModels = computed(() => draft.value.connections.filter(c => c.kind === 'transcription'))
const testAudio = ref<File>()

function addConnection() {
	draft.value.connections.push({id: crypto.randomUUID(), name: '', base_url: '', model: '', kind: 'chat', protocol: 'openai-chat', api_key: '', has_key: false})
}

function removeConnection(id: string) {
	draft.value.connections = draft.value.connections.filter(c => c.id !== id)
	for (const role of ['assistant', 'transcription', 'cleanup'] as const) {
		if (draft.value[role] === id) draft.value[role] = ''
	}
}

async function saveSettings() {
	try { await save.mutateAsync(draft.value) } catch { return }
}

async function testConnection(id: string, kind: string) {
	testResult.value = ''
	endpointResult.value = ''
	let audio = ''
	let filename = testAudio.value?.name ?? 'audio.webm'
	if (kind === 'transcription') {
		if (!testAudio.value) { testResult.value = t('tcymc.text.choose_an_audio_file_for_testing_first'); return }
		if (testAudio.value.size > 16 * 1024 * 1024) { testResult.value = t('tcymc.text.test_audio_must_not_exceed_16_mib'); return }
		let file: Blob = testAudio.value
		if (draft.value.connections.find(c => c.id === id)?.protocol === 'openai-audio') {
			try { const converted = await audioChatFile(file, filename); file = converted.file; filename = converted.filename }
			catch { testResult.value = t('tcymc.audioConversionFailed'); return }
		}
		audio = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(String(reader.result).split(',')[1])
			reader.onerror = reject
			reader.readAsDataURL(file)
		})
	}
	try {
		const result = await test.mutateAsync({connection_id: id, audio, filename})
		testResult.value = [result.text, result.warning].filter(Boolean).join('\n')
		endpointResult.value = result.endpoint ?? ''
	} catch (e) { if (isRequestContextAbort(e)) return; testResult.value = e instanceof Error ? e.message : t('tcymc.text.connection_test_failed_check_the_url_key_model') }
}

function protocols(kind: string) {
	return kind === 'transcription' ? ['openai-transcription', 'openai-audio', 'gemini'] as const : ['openai-chat', 'openai-responses', 'anthropic', 'gemini'] as const
}
const protocolNames = {'openai-chat': 'OpenAI Chat Completions', 'openai-responses': 'OpenAI Responses', anthropic: 'Anthropic Messages', gemini: 'Gemini generateContent', 'openai-transcription': 'OpenAI Audio Transcriptions', 'openai-audio': 'OpenAI Chat Audio'}
function changeKind(c: AIConnection) {
	c.protocol = c.kind === 'chat' ? 'openai-chat' : 'openai-transcription'
}
function endpoint(c: AIConnection, models = false) {
	const base = c.base_url.trim().replace(/\/+$/, '')
	if (!base) return t('tcymc.text.enter_a_base_url_to_see_the_endpoint')
	const paths = {'openai-chat': '/chat/completions', 'openai-responses': '/responses', anthropic: '/messages', 'openai-transcription': '/audio/transcriptions', 'openai-audio': '/chat/completions', gemini: `/models/${encodeURIComponent(c.model.replace(/^models\//, '') || '{model}')}:generateContent`}
	return base + (models ? '/models' : paths[c.protocol])
}
function fingerprint(c: AIConnection) { return JSON.stringify([c.base_url, c.protocol, c.kind]) }
function loadedModels(c: AIConnection) { const saved = modelLists.value[c.id]; return saved?.fingerprint === fingerprint(c) ? saved.models : [] }
async function fetchModels(c: AIConnection) {
	const stamp = fingerprint(c)
	try {
		const result = await modelFetcher.mutateAsync({id: c.id, base_url: c.base_url, protocol: c.protocol, kind: c.kind, api_key: c.api_key})
		if (stamp !== fingerprint(c)) return
		modelLists.value[c.id] = {models: result.models ?? [], fingerprint: stamp}
		modelNotice.value[c.id] = result.truncated ? t('tcymc.text.the_provider_has_many_models_only_the_first') : result.models?.length ? t('tcymc.text.model_list_updated_you_can_also_enter_a') : t('tcymc.text.the_provider_returned_no_models_enter_a_model')
	} catch (e) { if (isRequestContextAbort(e)) return; modelNotice.value[c.id] = t('tcymc.text.could_not_fetch_models_some_providers_do_not') }
}
function savedMatches(c: AIConnection) {
	const saved = props.initial.connections.find(s => s.id === c.id)
	return saved && saved.base_url === c.base_url && saved.model === c.model && saved.protocol === c.protocol && saved.kind === c.kind && !c.api_key
}
</script>

<template>
	<form
		class="tcy-settings"
		@submit.prevent="saveSettings"
	>
		<header>
			<p class="eyebrow">
				VIKUNJA X
			</p>
			<h2><Icon icon="robot" /> {{ t('tcymc.text.ai_and_voice') }}</h2>
			<p>{{ t('tcymc.text.connect_your_own_models_and_choose_one_for') }}</p>
		</header>
		<section class="tcy-panel">
			<h3 data-tour="ai-connections">
				<Icon icon="link" /> {{ t('tcymc.text.model_connections') }}
			</h3>
			<p>{{ t('tcymc.text.choose_your_provider_s_protocol_and_include_its') }}</p>
			<p
				v-if="!draft.connections.length"
				class="empty"
			>
				{{ t('tcymc.text.no_connections_yet_add_one_then_assign_it') }}
			</p>
			<fieldset
				v-for="(connection, index) in draft.connections"
				:key="connection.id"
				class="connection"
			>
				<legend>{{ t('tcymc.text.connection') }} {{ index + 1 }} · {{ connection.name || t('tcymc.text.new_model') }}</legend>
				<div class="fields">
					<label>{{ t('tcymc.text.connection_name') }}<input
						v-model="connection.name"
						class="input"
						required
						maxlength="100"
						:placeholder="t('tcymc.text.for_example_my_task_assistant')"
					></label>
					<label>{{ t('tcymc.text.connection_purpose') }}<select
						v-model="connection.kind"
						class="input"
						@change="changeKind(connection)"
					><option value="chat">{{ t('tcymc.text.text_chat_and_tool_calling') }}</option><option value="transcription">{{ t('tcymc.text.speech_recognition_and_transcription') }}</option></select></label>
					<label>{{ t('tcymc.text.request_protocol') }}<select
						v-model="connection.protocol"
						class="input"
					><option
						v-for="protocol in protocols(connection.kind)"
						:key="protocol"
						:value="protocol"
					>{{ protocolNames[protocol] }}</option></select></label>
					<label>{{ t('tcymc.text.api_base_url') }}<input
						v-model="connection.base_url"
						class="input"
						required
						type="url"
						placeholder="https://api.example.com/v1"
						autocomplete="off"
					></label>
					<label>{{ t('tcymc.text.model_id') }}<input
						v-model="connection.model"
						:list="`models-${connection.id}`"
						class="input"
						required
						:placeholder="t('tcymc.text.model_name_provided_by_your_service')"
					><datalist :id="`models-${connection.id}`"><option
						v-for="model in loadedModels(connection)"
						:key="model"
						:value="model"
					/></datalist></label>
					<label>{{ t('tcymc.apiKey') }}<input
						v-model="connection.api_key"
						class="input"
						type="password"
						autocomplete="new-password"
						:placeholder="initial.connections.some(c => c.id === connection.id && c.has_key) ? t('tcymc.text.saved_leave_blank_to_keep_the_current_key') : t('tcymc.text.enter_a_key_leave_blank_only_if_the')"
					></label>
				</div>
				<div class="endpoint-info">
					<span>{{ t('tcymc.text.request_endpoint') }}</span><code>{{ endpoint(connection) }}</code><span>{{ t('tcymc.text.model_list_endpoint') }}</span><code>{{ endpoint(connection, true) }}</code><small v-if="connection.protocol === 'openai-audio'">{{ t('tcymc.text.audio_chat_needs_a_model_that_accepts_audio') }}</small><small v-if="connection.protocol === 'anthropic'">{{ t('tcymc.text.anthropic_messages_does_not_accept_raw_audio_use') }}</small>
				</div>
				<div class="actions">
					<XButton
						variant="secondary"
						icon="cloud-download-alt"
						:disabled="modelFetcher.isPending.value || !connection.base_url"
						@click="fetchModels(connection)"
					>
						{{ t('tcymc.text.fetch_model_list') }}
					</XButton>
					<XButton
						variant="secondary"
						type="button"
						icon="play"
						:disabled="test.isPending.value || !savedMatches(connection)"
						@click="testConnection(connection.id, connection.kind)"
					>
						{{ t('tcymc.text.test_saved_connection') }}
					</XButton>
					<XButton
						variant="tertiary"
						type="button"
						@click="removeConnection(connection.id)"
					>
						{{ t('tcymc.text.remove_connection') }}
					</XButton>
				</div>
				<p
					v-if="modelNotice[connection.id]"
					role="status"
				>
					{{ modelNotice[connection.id] }}
				</p><small>{{ t('tcymc.text.save_connection_changes_before_testing_you_can_fetch') }}</small>
			</fieldset>
			<XButton
				variant="secondary"
				type="button"
				icon="plus"
				data-tour="ai-add"
				:disabled="draft.connections.length >= 20"
				@click="addConnection"
			>
				{{ t('tcymc.text.add_model_connection') }}
			</XButton>
			<label class="audio-test">{{ t('tcymc.text.audio_file_for_connection_testing') }}<input
				type="file"
				accept="audio/*"
				@change="testAudio = ($event.target as HTMLInputElement).files?.[0]"
			></label>
			<p
				v-if="testResult"
				role="status"
				class="test-result"
			>
				{{ testResult }}<code
					v-if="endpointResult"
					class="endpoint-result"
				>{{ endpointResult }}</code>
			</p>
		</section>
		<section class="tcy-panel">
			<h3 data-tour="ai-roles">
				<Icon icon="sitemap" /> {{ t('tcymc.text.models_for_each_feature') }}
			</h3>
			<div class="fields">
				<label>{{ t('tcymc.text.task_ai_assistant') }}<select
					v-model="draft.assistant"
					class="input"
				><option value="">{{ t('tcymc.text.not_enabled') }}</option><option
					v-for="c in chatModels"
					:key="c.id"
					:value="c.id"
				>{{ c.name }} · {{ c.model }}</option></select><small>{{ t('tcymc.text.choose_a_model_with_tool_calling_to_read') }}</small></label>
				<label>{{ t('tcymc.text.speech_recognition') }}<select
					v-model="draft.transcription"
					class="input"
				><option value="">{{ t('tcymc.text.not_enabled') }}</option><option
					v-for="c in speechModels"
					:key="c.id"
					:value="c.id"
				>{{ c.name }} · {{ c.model }}</option></select><small>{{ t('tcymc.text.turn_recordings_or_uploaded_audio_into_text') }}</small></label>
				<label>{{ t('tcymc.text.transcript_cleanup') }}<select
					v-model="draft.cleanup"
					class="input"
				><option value="">{{ t('tcymc.text.keep_the_original_transcript') }}</option><option
					v-for="c in chatModels"
					:key="c.id"
					:value="c.id"
				>{{ c.name }} · {{ c.model }}</option></select><small>{{ t('tcymc.text.improve_wording_and_punctuation_without_changing_tasks') }}</small></label>
			</div>
		</section>
		<div class="actions">
			<XButton
				variant="primary"
				type="submit"
				icon="save"
				data-tour="ai-save"
				:disabled="save.isPending.value"
			>
				{{ save.isPending.value ? t('tcymc.text.saving') : t('tcymc.text.save_settings') }}
			</XButton><XButton
				variant="secondary"
				:to="{name: 'tcy-ai'}"
			>
				{{ t('tcymc.text.open_ai_assistant') }}
			</XButton>
		</div>
	</form>
</template>

<style scoped>
.tcy-settings {
	display: grid;
	gap: 1.5rem;
}
.eyebrow {
	color: var(--primary);
	font-size: .75rem;
	letter-spacing: .16em;
}
h2 {
	margin-block: .25rem .75rem;
	font-size: 1.75rem;
}
h3 {
	margin-block-end: .75rem;
	font-size: 1.15rem;
}
.tcy-panel {
	padding: 1.5rem;
	border: 1px solid var(--grey-200);
	border-radius: .75rem;
	background: var(--white);
}
.connection {
	margin-block: 1.25rem;
	padding: 1rem;
	border: 1px solid var(--grey-200);
	border-radius: .5rem;
}
legend {
	padding-inline: .5rem;
	font-weight: 600;
}
.fields {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 1rem;
}
label {
	display: grid;
	gap: .4rem;
	font-size: .9rem;
}
small {
	color: var(--grey-600);
}
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: .75rem;
	margin-block-start: 1rem;
}
.empty, .audio-test {
	margin-block: 1rem;
}
.test-result {
	margin-block-start: 1rem;
	padding: 1rem;
	background: var(--grey-100);
	white-space: pre-wrap;
}
.endpoint-info {
	display: grid;
	gap: .4rem;
	margin-block-start: 1rem;
	font-size: .85rem;
}
.endpoint-info code, .endpoint-result {
	display: block;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
@media (width <= 600px) {
	.tcy-panel {
		padding: 1rem;
	}
	.connection {
		padding: .75rem;
		min-inline-size: 0;
	}
	.fields {
		grid-template-columns: minmax(0, 1fr);
	}
	.actions > * {
		flex: 1 1 auto;
	}
}
</style>
